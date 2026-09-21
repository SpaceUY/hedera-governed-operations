# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a **Hedera-native Next.js demo** (Proof Wall). There is **no Solidity workspace** — interactions use HCS (topics/messages), HTS (badge tokens), and Mirror Node APIs via wallet-signed transactions and server routes.

Use the package manager this project was created with (`packageManager` in the root `package.json`). Examples use `yarn`.

## Commands

```bash
yarn next:dev           # http://localhost:3000
yarn next:build
yarn next:check-types
yarn lint               # same as yarn next:lint
yarn test               # Vitest, files matching *.test.ts(x)
yarn setup              # idempotent testnet bootstrap: topic, demo accounts, writes .env.local
yarn format
```

Copy `packages/nextjs/.env.example` → `packages/nextjs/.env`. Required: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. After admin setup: `NEXT_PUBLIC_PROOF_WALL_TOPIC_ID`, optionally `NEXT_PUBLIC_PROOF_WALL_BADGE_TOKEN_ID`.

`yarn setup` (`packages/nextjs/scripts/setup.ts`) needs `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_PRIVATE_KEY` in `.env`, refuses mainnet, keeps ids and demo keys in `packages/nextjs/setup-state.json` (gitignored) and verifies them on the Mirror Node before creating anything. Product-specific fixtures go in the no-op hooks of `scripts/setup/extensions.ts`.

## App overview

| Route | Purpose |
|---|---|
| `/` | Proof Wall — submit proofs, browse HCS feed for the active topic |
| `/my-proofs` | Proofs filtered by connected account; badge display |
| `/admin` | Create HCS topic and HTS badge token (wallet-signed) |
| `/explorer` | Read-only Mirror Node view: decoded topic messages and schedule state, no wallet needed |

Config: `packages/nextjs/config/proofWallConfig.ts` (topic ID, badge token ID, Mirror Node / HashScan URLs from env).

## Layout

```
packages/nextjs/
  app/                    App Router pages and API routes
    api/hedera/           Mirror Node proxies, operator helpers, airdrop, badge check
  components/             ProofWall, SubmitProofForm, TopicSelector, BadgeDisplay, …
  hooks/
    useHederaSigner.ts    Wallet + Hedera account identity
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
  services/               hederaClient, badgeService
    web3/                 AppKit + HederaProvider setup, hederaSigner (wallet execute/sign/batch helpers)
    mirrorNode.ts         Re-export of services/mirror (kept for existing imports)
    mirror/               Typed Mirror Node client
      client.ts             Base URL per network, MirrorNodeError, mirrorGet, links.next paginator
      topics.ts             fetchTopicMessages, base64 → text/JSON decoding
      schedules.ts          fetchSchedule, fetchSchedulesByCreator, deriveScheduleState
      transactions.ts       normalizeTransactionId, fetchTransaction
      accounts.ts / contracts.ts  fetchAccount, fetchContractResult
      __fixtures__/         Recorded Mirror responses used by the tests
  utils/scaffold-hbar/    Hedera tx helpers, identity, topic/token resolution
  scaffold.config.ts      Target networks (testnet, mainnet), RPC, WalletConnect
  contracts/              deployedContracts.ts (empty — no Solidity workspace)
```

## Hedera integration patterns

**Wallet + identity:** `useHederaSigner` wraps connection state and `requireProvider()` for mutations, and binds `executeTransaction(tx)`, `signTransaction(tx)` (sign only, returns the signed `Transaction`) and `disconnect()` to the connected HashPack session. The pure functions live in `services/web3/hederaSigner.ts` (also `prepareBatchInnerTransaction`, `WalletRejectedError`, `isWalletRejection`); `NativeTransactionSignerBridge` reuses `executeTransaction` for `useNativeTransaction`. `components/ConnectWallet.tsx` is an inline connect/disconnect control for feature pages that shows wallet rejections as a message. Account IDs use `0.0.xxxxx` form; helpers in `utils/scaffold-hbar/identity.ts` normalize EVM ↔ native identity.

**HashPack signing rules:**
- Both ED25519 and ECDSA HashPack accounts work through the WalletConnect flow.
- Freeze before execute: `DAppSigner.freezeWithSigner` in `@hashgraph/hedera-wallet-connect` 2.1.x does not set node account ids. The signer freezes with a `Client` for the target network (`useTargetNetwork` → `Client.forTestnet()` / `forMainnet()`) and sets the transaction id from the connected account before `hedera_signAndExecuteTransaction` / `hedera_signTransaction`.
- Atomic batch inner transactions (HIP-551): `prepareBatchInnerTransaction(tx, { payer, batchKey })` does `setTransactionId(TransactionId.generate(payer))` + `setBatchKey` + `freeze()`. Never call `setNodeAccountIds` on an inner transaction.
- Wallet rejections arrive as WalletConnect JSON-RPC errors (`code` 5000–5003, or a `USER_REJECT` message); the signer maps them to `WalletRejectedError`.
- This native flow is separate from the EVM burner wallet of RainbowKit/`wagmi`: the harness CHAIN stage injects an ECDSA burner key through `localStorage["burnerWallet.pk"]`, which only drives the `wagmi` EVM path and is not wired to HashPack or to `useHederaSigner`.

**Submit proof:** `useSubmitProof` builds a JSON payload `{ text, author, timestamp }`, submits via `@hiero-ledger/sdk` `TopicMessageSubmitTransaction`, and sends through `useNativeTransaction` from `@scaffold-hbar-ui/hooks`.

**Read feed:** `useTopicMessages` fetches from `/api/hedera/topic-messages` (Mirror Node). Home page polls every 15s; passes `onNewMessage` after submit for optimistic refresh. For new reads prefer the hooks in `hooks/mirror/`: Mirror reads are public, so they call the Mirror Node directly from the client with `services/mirror` (typed responses, `MirrorNodeError` on non-2xx, `mirrorGetAllPages` for `links.next`). `useTopicMessagesFeed` returns messages already decoded (`text`, and `json` when the payload parses); `useSchedule` / `useTransaction` poll every 5s while pending or not yet indexed (404) and stop once settled; queries stay disabled while the id is empty or malformed.

**Mirror Node traps** (verified on testnet):

- `GET /api/v1/schedules?account.id=X` filters by the schedule **creator** (`creator_account_id`), not by `payer_account_id`. Querying with the payer returns an empty list. See `fetchSchedulesByCreator`.
- A schedule's `signatures` list also contains the signature the `ScheduleCreate` payer added implicitly; it does not count toward the threshold of the scheduled transaction's keys, so `signatures.length` is an upper bound. See `MirrorSchedule.signatures`.
- Mirror lags consensus by seconds: a freshly submitted entity 404s for a while, and state such as a schedule's `executed_timestamp` or a transaction id appears later. Poll instead of reading once (`resolvePendingRefetchInterval` in `hooks/mirror/mirrorQuery.ts`).
- Transaction ids come in two forms: the SDK's `0.0.x@sec.nanos` and Mirror's `0.0.x-sec-nanos` (used in paths). `normalizeTransactionId` accepts both; the same id can return several rows (parent plus scheduled/child rows).

**Admin create topic/token:** Client hooks call API routes or native transactions; after submit, `resolveTopicIdFromTransactionId` / `resolveTokenIdFromTransactionId` poll Mirror Node until IDs are indexed (may take 10–20s).

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

`packages/nextjs/scaffold.config.ts` — `hederaTestnet` and `hedera` mainnet. RPC overrides via `NEXT_PUBLIC_HEDERA_*_RPC_URL`. Default polling interval: 10s.

## Validate with Hedera Harness

`.harness/` holds the harness recipe (`hedera-harness@2.0.0-rc.4`, schema v3; the recipe assumes Yarn). Run the stages in this order after changing the app:

```bash
npx hedera-harness doctor             # preflight
npx hedera-harness validate           # ASSERT + SMOKE, no credentials needed
npx hedera-harness validate-semantic  # EVALUATE against .harness/eval.json (needs claude CLI + browser)
yarn harness:run                      # generate from .harness/prd.md, then validate and repair
```

Keep `.harness/validators/static.json` and `.harness/eval.json` in sync with routes and copy you change. Do not assert on `template.json`: `create-scaffold-hbar` removes it when scaffolding.

## Code style

| Style | Use for |
|---|---|
| `UpperCamelCase` | types, components, enums |
| `lowerCamelCase` | functions, variables, hooks |
| `CONSTANT_CASE` | constants |

Prefer `type` over `interface`. Comments only when they add non-obvious context.
