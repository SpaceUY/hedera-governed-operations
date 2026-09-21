# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a **Hedera-native Next.js template**: HCS topics and messages, HTS tokens, Mirror Node reads, HashPack signing through WalletConnect, and a SaucerSwap-backed swap provider. There is **no Solidity workspace and no EVM contract deploy**; every write is a native Hiero SDK transaction signed either by the user's wallet or by a server-side operator. The Proof Wall pages are a demo of the reusable modules, not the product.

<!-- TODO(product): update the product sentence above once the shipped feature set is decided. -->

Use Yarn (`packageManager` in the root `package.json`). Never switch the workspace to npm or pnpm.

## Commands

```bash
yarn setup              # idempotent testnet bootstrap; writes ids to packages/nextjs/.env.local
yarn next:dev           # http://localhost:3000
yarn next:build
yarn next:check-types
yarn lint               # same as yarn next:lint
yarn test               # Vitest, files matching *.test.ts(x)
yarn format
```

Copy `packages/nextjs/.env.example` → `packages/nextjs/.env`. Required for signing from the browser: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Required for `yarn setup` and operator-signed routes: `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`, `HEDERA_NETWORK=testnet`. `yarn setup` (`packages/nextjs/scripts/setup.ts`) writes the demo ids (`NEXT_PUBLIC_PROOF_WALL_TOPIC_ID`, `NEXT_PUBLIC_DEMO_ACCOUNT_*_ID`) to `.env.local`; set `NEXT_PUBLIC_PROOF_WALL_TOPIC_ID` by hand in `.env` if you skip it. It refuses mainnet, keeps ids and demo keys in `packages/nextjs/setup-state.json` (gitignored) and verifies them on the Mirror Node before creating anything; product-specific fixtures go in the no-op hooks of `scripts/setup/extensions.ts`. `.env.example` is the single list of documented variables: add new ones there with an empty value. Never commit `.env` or `.env.local`.

## App overview

| Route           | Purpose                                                               |
| --------------- | --------------------------------------------------------------------- |
| `/`             | Proof Wall — submit proofs, browse HCS feed for the active topic      |
| `/my-proofs`    | Proofs filtered by connected account; badge display                   |
| `/admin`        | Create HCS topic and HTS badge token (wallet-signed)                  |
| `/explorer`     | Read-only Mirror Node view: decoded topic messages and schedule state |
| `/api/hedera/*` | Mirror Node proxies, operator status, badge airdrop (operator-signed) |

Config: `packages/nextjs/config/proofWallConfig.ts` (topic ID, badge token ID, Mirror Node / HashScan URLs from env).

## Layout

```
packages/nextjs/
  app/                    App Router pages and API routes
    api/hedera/           Mirror Node proxies, operator helpers, airdrop, badge check
  components/             ProofWall, SubmitProofForm, TopicSelector, BadgeDisplay, …
  hooks/
    useHederaSigner.ts    Wallet session + Hedera account identity for the UI
    useSubmitProof.ts     HCS TopicMessageSubmitTransaction via native tx hook
    useTopicMessages.ts   Poll Mirror Node for topic messages
    useCreateTopic.ts     Admin: create HCS topic
    useCreateToken.ts     Admin: create HTS badge token
    useBadgeTokens.ts     Badge balance / eligibility
    mirror/               React Query hooks over services/mirror
      useSchedule.ts        Schedule + derived state; polls while pending
      useTransaction.ts     Mirror rows for a tx id; polls until indexed
      useAccount.ts         Account by 0.0.x id or EVM address
      useTopicMessagesFeed.ts  Decoded topic messages straight from Mirror
      mirrorQuery.ts        Shared options, query keys, polling decision
    scaffold-hbar/        Shared Scaffold-HBAR hooks (useTargetNetwork, …)
  services/
    web3/                 AppKit + HederaProvider bootstrap, WalletConnect context, signer bridge
    web3/hederaSigner.ts  Reusable HashPack signer: sign-and-execute, sign-only, batch inner txs
    mirrorNode.ts         Re-export of services/mirror (kept for existing imports)
    mirror/               Typed Mirror Node client (HTTP only, no SDK)
      client.ts             Base URL per network, MirrorNodeError, mirrorGet, links.next paginator
      topics.ts             fetchTopicMessages, base64 → text/JSON decoding
      schedules.ts          fetchSchedule, fetchSchedulesByCreator, deriveScheduleState
      transactions.ts       normalizeTransactionId, fetchTransaction
      accounts.ts / contracts.ts  fetchAccount, fetchContractResult
      __fixtures__/         Recorded Mirror responses used by the tests
    swap/                 SwapProvider interface + SaucerSwap V2 implementation
    hederaClient.ts       Server-side Hiero SDK client with the operator key
    badgeService.ts       Demo: badge airdrop logic (operator-signed)
  utils/scaffold-hbar/    Hedera tx helpers, identity, topic/token resolution
  scaffold.config.ts      Target networks (testnet, mainnet), RPC, WalletConnect
  contracts/              deployedContracts.ts (empty — no Solidity workspace)
.harness/                 Hedera Harness recipe (spec, prd, validators, eval)
docs/                     ARCHITECTURE.md, RUNBOOK.md
```

## Hedera integration patterns

### Stack

- **Hiero SDK** (`@hiero-ledger/sdk`) builds every transaction, on the client and on the server. No `ethers`/`viem` calls for Hedera writes.
- **HashPack via WalletConnect**: `@hashgraph/hedera-wallet-connect` + Reown AppKit (`services/web3/appKitHedera.ts`, `hederaWalletConnect.tsx`). The wallet exposes `hedera_signAndExecuteTransaction` and `hedera_signTransaction`; the app never holds a user key. Both ED25519 and ECDSA accounts work. `components/ConnectWallet.tsx` is an inline connect/disconnect control that shows wallet rejections as a message.
- **Signing port** (`services/web3/hederaSignerPort.ts`): `HederaSigner = { kind, accountId, network, executeTransaction, signTransaction }` with two implementations — `hashPackSigner.ts` (the WalletConnect session) and `burnerSigner.ts` (an ECDSA key read from `localStorage["burnerWallet.pk"]`, the key Hedera Harness CHAIN injects). `hooks/useHederaSigner.ts` picks one and exposes `executeTransaction(tx)`, `signTransaction(tx)` (sign only, returns the signed `Transaction`), `requireAccountId()`, `signerKind` and `disconnect()`; components never know which signer is active.
- **Mirror Node REST** for all reads (`services/mirror`, re-exported from `services/mirrorNode.ts`): typed responses, `MirrorNodeError` on non-2xx, `mirrorGetAllPages` for `links.next`. Reads are public, so the hooks in `hooks/mirror/` call the Mirror Node directly from the client: `useTopicMessagesFeed` returns decoded messages (`text`, and `json` when the payload parses); `useSchedule` / `useTransaction` poll every 5 s while pending or not yet indexed (404) and stop once settled; queries stay disabled while the id is empty or malformed. It is eventually consistent: expect a few seconds of lag after a transaction reaches consensus.
- **Identity**: account IDs use the `0.0.xxxxx` form; `utils/scaffold-hbar/hederaIdentity.ts` normalizes EVM ↔ native identity and builds CAIP ids for the wallet.

### Signing conventions

- **Wallet-signed (client)**: build the transaction with the SDK and hand it to `useHederaSigner` (`executeTransaction` / `signTransaction`); the active signer freezes it with a network `Client`. Use this for anything the user owns or pays for: submitting a proof, creating a topic or token, swapping. Read the payer with `requireAccountId()`, not from the wallet provider, so the code works with both signers.
- **Test signer (burner)**: `services/web3/BurnerSignerProvider.tsx` reads `localStorage["burnerWallet.pk"]` on load, resolves the account id from the key's EVM alias through the Mirror Node (`GET /api/v1/accounts/0x…`, retried for indexing lag) and takes precedence over HashPack. `burnerSigner.ts` signs with `freezeWith(client)` + `execute(client)` / `sign(key)`; the burner is the client's operator. It only activates on testnet and, in production builds, only when `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true` (`burnerSignerPolicy.ts`). The header shows the account with a "test signer" badge; "Disconnect" forgets the key. This is the burner-wallet pattern of the Hedera Harness x402 recipe ([hedera-dev/hedera-harness](https://github.com/hedera-dev/hedera-harness)), adapted to native signing since HashPack cannot be driven by Playwright. `BurnerSigner.publicKey` is the extension point for demo modes that need the ephemeral account on-chain (e.g. as a threshold-key member); a payer-only demo needs nothing beyond `chainValidation.fundingHbar`.
- **Operator-signed (server route)**: `services/hederaClient.ts` reads `HEDERA_OPERATOR_*` and signs inside `app/api/hedera/*` route handlers. Use this only for actions the app itself pays for (badge airdrops, setup). Never expose the operator key to the client; return `503` when it is missing (see `check-badge/route.ts`).
- **Freeze before execute**: always `freeze()` / `freezeWith(client)` a transaction before signing or serialising it. A frozen transaction has its transaction id and node account ids fixed; an unfrozen one cannot be signed by an external wallet.
- **Batch inner transactions (HIP-551)**: for an inner transaction the wallet signs and the server batches, set `setTransactionId(TransactionId.generate(payer))`, `setBatchKey(serviceKey)`, then `freeze()`. Do **not** call `setNodeAccountIds`: it locks the node list and `freeze()` can no longer pin node `0.0.0`, which a batch requires. The service adds the signed inner tx to a `BatchTransaction` and executes it with the batch key.
- **Wallet rejections** arrive as WalletConnect JSON-RPC errors (`code` 5000–5003, EIP-1193 `4001`, or a `USER_REJECT` message); `hederaSigner.ts` maps them to `WalletRejectedError` (`isWalletRejection`) so components can show a message instead of a crash.
- **After a write, poll the Mirror Node** until the entity appears (`resolveTopicIdFromTransactionId`, `resolveTokenIdFromTransactionId`), typically 3–20 s. Never assume a read right after `execute` reflects the write.

### Verified traps

- `DAppSigner.freezeWithSigner` (`hedera-wallet-connect` 2.1.x) does **not** set node account ids; freeze with a `Client.forTestnet()` / `forMainnet()` before `executeWithSigner` or the wallet call fails.
- Mirror `GET /schedules?account.id=X` filters by **creator** of the schedule (`creator_account_id`), not by `payer_account_id`; querying with the payer returns an empty list. See `fetchSchedulesByCreator`.
- Mirror lists the **payer's signature** on a schedule too (added implicitly by `ScheduleCreate`); it does not count toward a threshold key, so `signatures.length` is an upper bound. Filter signatures by the keys that make up the threshold key.
- Mirror Node lag: reads right after consensus return 404 or stale pages. Retry with backoff (`utils/scaffold-hbar/resolve*`) instead of failing.
- Swap quoting must be **on-chain** (`QuoterV2` or the pool's `sqrtRatioX96`). Reserve numbers from the SaucerSwap API do not give the concentrated-liquidity price; using them for `amountOutMinimum` reverts with `Too little received`.
- Transaction ids come in two forms: the SDK's `0.0.x@sec.nanos` and Mirror's `0.0.x-sec-nanos` (used in paths). `normalizeTransactionId` accepts both; one id can return several rows (parent plus scheduled/child rows).
- The harness validator recipe expects a RainbowKit "Burner Wallet" entry in the connect modal; this app has no RainbowKit. `BurnerSignerProvider` connects on its own after the reload, so the validator's modal steps are moot and the "header shows a connected account" check passes; keep that behaviour when changing the wallet controls.
- The burner account is created with `setECDSAKeyWithAlias`, so it is only reachable by its EVM alias until Mirror indexes it (a few seconds): `resolveBurnerAccountId` retries on 404 for ~20 s. `Client.forTestnet()` in the browser needs `scheduleNetworkUpdate: false`.
- `validate-semantic` persists the CHAIN signer as `chain-signer.json` at the workspace root (gitignored: it holds a funded private key) and does **not** sweep the account (only `run` does). On the next run it reuses that account through an `AccountBalanceQuery`, which testnet consensus nodes can answer with `BUSY` until the SDK gives up (`max attempts of 10 was reached`), even while transactions go through. Delete the account yourself (`AccountDeleteTransaction` signed with its key, balance back to the operator), remove `chain-signer.json` and rerun: a fresh signer needs no balance query.
- On a malformed `HEDERA_OPERATOR_PRIVATE_KEY` the harness echoes the value in its error message. Export the bare key (no inline comment or quotes copied from `.env`).
- ECDSA signing with `@hiero-ledger/sdk` fails under jsdom (`msgHash must be hex string or Uint8Array`: cross-realm `Uint8Array`); tests that sign run with `// @vitest-environment node`.
- The harness does not load `.env`; a `.env` file inside the tree fails the ASSERT stage. Remove it before `npx hedera-harness validate`.

### How to add an operation

1. **Service function** in `services/` that builds and freezes the SDK transaction (pure, testable, no React). Return the frozen transaction or the `transactionId`.
2. **Hook** in `hooks/` wrapping it in `useMutation`; get the signer through `useHederaSigner` and call `requireAccountId()` early so it throws when nothing is connected and works with both HashPack and the test signer.
3. **Read side**: add or reuse a hook under `hooks/mirror/` so the UI refreshes from the Mirror Node after the write; pass the expected sequence number or transaction id so polling knows when to stop.
4. **Tests** next to the code (`*.test.ts`): assert the transaction shape (type, payer, memo, batch key) with the SDK, mock the wallet and Mirror calls, never hit the network.
5. **Env**: any new id or key goes to `packages/nextjs/.env.example` with an empty value; extend `yarn setup` if it can be created on testnet.

### How to add a harness eval assertion

1. Add an entry to `.harness/eval.json` → `assertions` with a stable `id` (`E3`, `E4`, …; never renumber existing ones), `journey`, `route`, `severity`, `walletRequired`, `verifiableWithoutCredentials`, `statement` and a concrete `howToVerify` (element text, expected console state).
2. Add the route to `routes` if it is new, and to `.harness/validators/playwright-smoke.yaml` so SMOKE boots it.
3. If the assertion depends on copy or a file, mirror it in `.harness/validators/static.json` (`textAssertions` / `fileAssertions`) so ASSERT catches regressions without a browser.
4. Run `npx hedera-harness doctor` (schema) and `npx hedera-harness validate` (ASSERT + SMOKE); run `validate-semantic` when the `claude` CLI and a browser are available.

## UI

Use `@scaffold-hbar-ui/components` for web3 UI (`Address`, `HederaAddressInput`, `Balance`, `HbarInput`, `HederaPortalFaucet`, etc.).

Use DaisyUI classes for layout and controls:

```tsx
<button className="btn btn-primary">Connect</button>
<div className="card bg-base-100 shadow-xl">...</div>
```

Import app code with the `~~` alias:

```tsx
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
```

## Networks

`packages/nextjs/scaffold.config.ts` — `hederaTestnet` and `hedera` mainnet. RPC overrides via `NEXT_PUBLIC_HEDERA_*_RPC_URL`. Default polling interval: 10s. `yarn setup` and the runbook target **testnet only**.

## Validate with Hedera Harness

`.harness/` holds the harness recipe (`hedera-harness@2.0.0-rc.4`, schema v3; the recipe assumes Yarn). Run the stages in this order after changing the app:

```bash
npx hedera-harness doctor             # preflight
npx hedera-harness validate           # ASSERT + SMOKE, no credentials needed
npx hedera-harness validate-semantic  # EVALUATE against .harness/eval.json (needs claude CLI + browser)
yarn harness:run                      # generate from .harness/prd.md, then validate and repair
```

`chainValidation` is enabled in `spec.yaml`: `validate-semantic` and `harness:run` provision a funded testnet account with the operator exported in the shell (`HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`; the harness does not read `.env`) and inject its key as `localStorage["burnerWallet.pk"]`, which the app picks up as the test signer. `validate` and `doctor --recipe-only` ignore it, so CI needs no credentials; the full `doctor` reports the two variables as missing until you export them. Assertions flagged `executableWithTestSigner` (E3) run end to end and are verified on the Mirror Node.

Keep `.harness/validators/static.json` and `.harness/eval.json` in sync with routes and copy you change. Do not assert on `template.json`: `create-scaffold-hbar` removes it when scaffolding.

## Code style

| Style            | Use for                     |
| ---------------- | --------------------------- |
| `UpperCamelCase` | types, components, enums    |
| `lowerCamelCase` | functions, variables, hooks |
| `CONSTANT_CASE`  | constants                   |

TypeScript strict, no `any`, named exports, early returns, functions with at most three parameters and no boolean flags. Prefer `type` over `interface`. Comments only when they add non-obvious context; no commented-out code.
