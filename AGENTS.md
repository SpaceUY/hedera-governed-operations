# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a **Hedera template with two workspaces**: `packages/nextjs` (HCS topics and messages, HTS tokens, Mirror Node reads, HashPack signing through WalletConnect, a SaucerSwap-backed swap provider) and `packages/hardhat` (Solidity contracts deployed through the Hedera JSON-RPC relay). Native writes are Hiero SDK transactions signed either by the user's wallet or by a server-side operator; contract deploys go through Hardhat and regenerate `packages/nextjs/contracts/deployedContracts.ts`. The Proof Wall pages are a demo of the reusable modules, not the product.

<!-- TODO(product): update the product sentence above once the shipped feature set is decided. -->

The governance UI owns `/`: a governance home (treasury figures, the council's threshold, the pending proposals) and a proposal detail page at `/governance/[scheduleId]` with Sign, Withdraw and Cancel, backed by `useProposals`, `useProposalLookup`, `useTreasuryFigures` and the mutation hooks (`useCreateProposal`, `useCreateNativeProposal`, `useSignProposal`, `useWithdrawProposal`, `useCancelProposal`). Proof Wall moved to `/proof-wall`. `/governance/new` opens a proposal: a vault upgrade or a supplier payment so far, previewed through the same decoders the detail page uses. See `docs/GOVERNANCE_UI.md` for how the screens are built (layout, setup guard, which actions a proposal offers and to whom, the copy for its state) before working in this area.

Use Yarn (`packageManager` in the root `package.json`). Never switch the workspace to npm or pnpm.

## Commands

```bash
yarn setup              # idempotent testnet bootstrap; writes ids to packages/nextjs/.env.local
yarn next:dev           # http://localhost:3000
yarn next:build
yarn next:check-types
yarn lint               # next:lint + hardhat:lint
yarn test               # next:test (Vitest, *.test.ts(x)) + hardhat:test
yarn format

yarn hardhat:compile    # contracts under packages/hardhat/contracts/
yarn hardhat:test
yarn hardhat:check-types
yarn hardhat:deploy --network hederaTestnet   # also rewrites packages/nextjs/contracts/deployedContracts.ts
yarn hardhat:verify:testnet                   # Sourcify, prints the HashScan link
```

`*.integration.test.ts` files talk to testnet and skip themselves unless `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_PRIVATE_KEY` are exported in the shell and `yarn setup` has written `setup-state.json`, so `yarn test` and CI need no credentials.

Copy `packages/nextjs/.env.example` → `packages/nextjs/.env`. Required for signing from the browser: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Required for `yarn setup` and operator-signed routes: `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`, `HEDERA_NETWORK=testnet`. `yarn setup` (`packages/nextjs/scripts/setup.ts`) writes the demo ids (`NEXT_PUBLIC_PROOF_WALL_TOPIC_ID`, `NEXT_PUBLIC_DEMO_ACCOUNT_*_ID`, `NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID`, `NEXT_PUBLIC_DEMO_TOKEN_ID`, `NEXT_PUBLIC_SEED_PROPOSAL_ID`) to `.env.local`; set `NEXT_PUBLIC_PROOF_WALL_TOPIC_ID` by hand in `.env` if you skip it. It also requires `HEDERA_COUNCIL_ACCOUNT_ID`, the account of yours that becomes a member of the governance threshold key. It refuses mainnet, keeps ids and demo keys in `packages/nextjs/setup-state.json` (gitignored) and verifies them on the Mirror Node before creating anything; product-specific fixtures go in the hooks of `scripts/setup/extensions.ts`.

**`yarn setup` runs twice, on either side of `yarn hardhat:deploy`** (`docs/RUNBOOK.md` §3). The dependency is circular and crosses the workspace boundary: `GovernedExecutor`'s constructor takes the governance account's address and the proposer list, and the setup script is what creates that account; the demo token's pause and freeze keys are `TokenAdmin`'s contract id, and a token created without an admin key can never have them changed. So the first run creates the account and writes `GOVERNANCE_ACCOUNT_ADDRESS` and `INITIAL_PROPOSERS` into `packages/hardhat/.env`, the deploy runs, and the second run creates the token and the seed proposal. A third run creates nothing. `PROPOSER_ROLE` cannot be granted after the deploy — the role's admin is the contract itself, so it would take an approved proposal — which is why the proposer list is composed before it. `.env.example` is the single list of documented variables: add new ones there with an empty value. Never commit `.env` or `.env.local`.

## App overview

| Route                      | Purpose                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Governance home — treasury figures, council threshold, pending proposals; a setup notice until `yarn setup` and the deploy have run |
| `/governance/[scheduleId]` | One proposal by schedule id: decoded operation, registry state, gas and HBAR, approvals; Sign / Withdraw / Cancel (wallet-signed)   |
| `/governance/new`          | Open a proposal — pick an operation, see what the council will see, register and/or schedule it (wallet-signed)                     |
| `/proof-wall`              | Proof Wall — submit proofs, browse HCS feed for the active topic                                                                    |
| `/my-proofs`               | Proofs filtered by connected account; badge display                                                                                 |
| `/admin`                   | Create HCS topic and HTS badge token (wallet-signed)                                                                                |
| `/explorer`                | Read-only Mirror Node view: decoded topic messages and schedule state                                                               |
| `/api/hedera/*`            | Mirror Node proxies, operator status, badge airdrop (operator-signed)                                                               |

Config: `packages/nextjs/config/proofWallConfig.ts` (topic ID, badge token ID, Mirror Node / HashScan URLs from env) and `packages/nextjs/config/governanceConfig.ts` (the ids `yarn setup` writes, deployed contract lookup).

## Layout

```
packages/nextjs/
  app/                    App Router pages and API routes
    api/hedera/           Mirror Node proxies, operator helpers, airdrop, badge check
  components/             ProofWall, SubmitProofForm, TopicSelector, BadgeDisplay, …
    governance/           MutationError and the proposal wizard (ProposalWizardProvider + ProposalWizard, picker, forms, preview)
  hooks/
    useHederaSigner.ts    Wallet session + Hedera account identity for the UI
    useSubmitProof.ts     HCS TopicMessageSubmitTransaction via native tx hook
    useTopicMessages.ts   Poll Mirror Node for topic messages
    useCreateTopic.ts     Admin: create HCS topic
    useCreateToken.ts     Admin: create HTS badge token
    useBadgeTokens.ts     Badge balance / eligibility
    mirror/               React Query hooks over services/mirror
      useSchedule.ts        Schedule + derived state + execution outcome; polls until the outcome is final
      useProposals.ts       The council's proposals; polls fast while any is open, slowly once all settled
      useCouncil.ts         Members, threshold and proposers; cached, since only a passed proposal changes them
      useRefreshOnSettle.ts Re-reads treasury figures (and the council after a rotation) when a proposal settles
      useTransaction.ts     Mirror rows for a tx id; polls until indexed
      useAccount.ts         Account by 0.0.x id or EVM address
      useToken.ts           Token metadata and pause state, with decimals already a number
      useTokenRelationship.ts  Whether one account is frozen for one token
      useTopicMessagesFeed.ts  Decoded topic messages straight from Mirror
      mirrorQuery.ts        Shared options, query keys, polling decision
    scaffold-hbar/        Shared Scaffold-HBAR hooks (useTargetNetwork, …)
  services/
    web3/                 AppKit + HederaProvider bootstrap, WalletConnect context, signer bridge
      hederaSignerPort.ts   HederaSigner port shared by every signer
      hashPackSigner.ts     Port adapter over the WalletConnect session
      hederaSigner.ts       HashPack wallet calls: sign-and-execute, sign-only, batch inner txs
      burnerSigner.ts       Port adapter over the harness test key (localStorage["burnerWallet.pk"])
      burnerSignerPolicy.ts Where the test signer is allowed (testnet; opt-in in production)
      BurnerSignerProvider.tsx  Reads the key on load, resolves the account, exposes useBurnerSigner
    mirrorNode.ts         Re-export of services/mirror (kept for existing imports)
    mirror/               Typed Mirror Node client (HTTP only, no SDK)
      client.ts             Base URL per network, MirrorNodeError, mirrorGet, links.next paginator
      topics.ts             fetchTopicMessages, base64 → text/JSON decoding
      schedules.ts          fetchSchedule, fetchSchedulesByCreator, deriveScheduleState, fetchScheduleExecution
      transactions.ts       normalizeTransactionId, fetchTransaction, fetchTransactionsAt
      accounts.ts / contracts.ts  fetchAccount, fetchContract, fetchContractResult
      tokens.ts             fetchToken, fetchTokenRelationship, parseTokenDecimals
      __fixtures__/         Recorded Mirror responses used by the tests
    governance/           Proposals as scheduled transactions
      schedules.ts          ScheduleCreate with the governance account as payer, ScheduleSign, ScheduleDelete
      council.ts            Threshold key (who approves) and PROPOSER_ROLE (who proposes), read from the ledger
      proposals.ts          The inbox: schedules by proposer, narrowed to the governance account's, with m-of-n
      proposalTypes.ts      The five kinds, their measured execute gas, and the shapes a decoded proposal takes
      proposalRoutes.ts     The path each kind takes, in roles (governance account, executor, subject, …)
      graph.ts              The governance graph: nodes, edges, a proposal's scope, the fallback layout
      encode.ts             Form values to transactions: the five encoders, the registration gas, createProposal
      decode.ts             Scheduled body and registry calldata back to a described operation
      registry.ts           GovernedExecutor: the entry behind a proposal, cancel, and the id a create returned
      treasury.ts           Treasury balances plus the vault's reserve
      proposalActions.ts    Which actions a proposal offers (Sign, Withdraw, Cancel), and to whom
      proposalLabels.ts     The words a screen uses for a proposal's status, registry entry and approvals
      scheduledBody.ts      The body a schedule carries, built from its transaction (the wizard's preview)
      drafts.ts             Form values to an encoded draft, and its preview read back through decode.ts
    swap/                 SwapProvider interface + SaucerSwap V2 implementation
    hederaClient.ts       Server-side Hiero SDK client with the operator key
    badgeService.ts       Demo: badge airdrop logic (operator-signed)
  utils/scaffold-hbar/    Hedera tx helpers, identity, topic/token resolution
  scaffold.config.ts      Target networks (testnet, mainnet), RPC, WalletConnect
  contracts/              deployedContracts.ts (generated by yarn hardhat:deploy), externalContracts.ts
packages/hardhat/
  contracts/              Solidity sources
  deploy/                 hardhat-deploy scripts, run in filename order
  test/                   Contract tests
  scripts/                Deployer account management, ABI generation, Sourcify verification
  hardhat.config.ts       Networks (hardhat, localhost, hederaTestnet, hederaMainnet), Sourcify, typechain
.harness/                 Hedera Harness recipe (spec, prd, validators, eval)
docs/                     ARCHITECTURE.md, RUNBOOK.md, GLOSSARY.md, GOVERNANCE_UI.md (governance screens)
```

## Hedera integration patterns

### Stack

- **Hiero SDK** (`@hiero-ledger/sdk`) builds every transaction, on the client and on the server. No `ethers`/`viem` calls for Hedera writes. `packages/nextjs` also declares **`@hiero-ledger/proto`** at an exact version, to decode the governance account's threshold key; it is the copy the SDK already resolves, which is why there is only one in the tree. **Upgrade the two together**, then check with `yarn why @hiero-ledger/proto` that `packages/nextjs` still resolves a single version — raising the SDK alone leaves the SDK on its own newer `proto` while the app imports the older one by name, which nothing fails on today and is exactly the kind of drift found late.
- **`yarn install` prints ~25 peer-dependency warnings, and none of them affects runtime.** Seventeen name one of our workspaces and eight are between third parties; the counts and the split are unchanged from the upstream scaffold this template tracks, whose `.yarnrc.yml` this one matches byte for byte. Most are true statements about deliberate choices — wagmi 3 against packages that ask for wagmi 2, `next-themes` 0.3 against React 19 — so they are left visible rather than silenced with `packageExtensions`, which would mean asserting we know better than six packages about their own peers. Two warnings mentioning `@hiero-ledger/sdk@2.88.0` come from `hedera-harness`'s own tree, not from the app.
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
- **A schedule's `m of n` is not `signatures.length`.** Mirror records a row for every key that signed anything touching the schedule, and two kinds never count toward the threshold: the row `ScheduleCreate` adds for whoever paid to open the proposal, and the row every `ScheduleSign` adds for whoever paid to submit it. Measured on testnet, an executed 2-of-3 proposal shows **four** rows — two members and the payer twice. Count **council members, not rows** (`countThresholdSignatures`): a member is in or out however many rows carry its key. Do not discard every creator signature either — when the proposer holds a seat, which is what the demo does, it counts once and legitimately.
- **The members of a threshold key come back as an opaque blob.** Mirror returns the governance account's key as `_type: "ProtobufEncoded"`, so `fetchCouncilKey` decodes it with `@hiero-ledger/proto` — the package the Hiero SDK already depends on, so it adds nothing to the bundle (its version follows the SDK's; see **Stack**). Read it from the ledger, never from env: rotating the council is itself a proposal. Match a signature to a member in **hex**, since `public_key_prefix` is a prefix and base64 packs three bytes into four characters.
- **Mirror has no query for "proposals of the governance account".** `GET /schedules?account.id=X` filters by creator, and a proposal is defined by its payer, so the inbox is the union of the schedules each `PROPOSER_ROLE` holder created, narrowed to the ones the governance account pays for. A native proposal needs no role, so one opened outside it is never listed — accepted, and reachable by its schedule id.
- Reading a contract from the browser goes through the **JSON-RPC relay** (`createPublicClient` + `getHederaRpcUrl`), not `ContractCallQuery`: there is no operator key on the client. Under jsdom viem's fetch fails on a cross-realm `AbortSignal`, so tests that read a contract run with `// @vitest-environment node`.
- Mirror Node lag: reads right after consensus return 404 or stale pages. Retry with backoff (`utils/scaffold-hbar/resolve*`) instead of failing.
- Swap quoting must be **on-chain** (`QuoterV2` or the pool's `sqrtRatioX96`). Reserve numbers from the SaucerSwap API do not give the concentrated-liquidity price; using them for `amountOutMinimum` reverts with `Too little received`. `QuoterV2.quoteExactInputSingle` is not `view` — it simulates the swap and reverts internally — so it has to go through the relay's `eth_call` (`createJsonRpcQuoter`); the SDK's `ContractCallQuery` rejects it in precheck with `INSUFFICIENT_GAS` at any gas value.
- **The gas limit on a scheduled contract call is a price, not a ceiling.** A scheduled call that succeeds is charged the whole limit; one that reverts is charged only what it consumed. Measured on testnet at 109 tinybar per gas unit: the same treasury swap cost 1.6350 HBAR with a 1,500,000 limit and 0.3161 HBAR with a 290,000 one, and the vault upgrade consumed 99,015 of a 300,000 limit and still paid for all 300,000. So the limit belongs to the operation, not to a shared constant — an upgrade proposal and a swap proposal are 99k and 241k of work, and the governance account pays the difference for any headroom left unused. `PROPOSAL_TYPES` carries one measured limit per kind for that reason. A **plain** `ContractExecute` is the opposite and the two are easy to confuse: the same `createProposal` cost 0.2086 HBAR at a 400,000 limit and at a 1,200,000 one, both consuming 191,355, so headroom outside a schedule is free. Note also that the consumption of a scheduled `execute` depends on the calldata the entry stores, not only on its kind: the vault upgrade consumes 65,410 with no initializer and 99,015 with one nested in it.
- **An HTS token key can be a contract id, and that is the only way a council governs a token.** A scheduled `TokenPause` is refused (`SCHEDULED_TRANSACTION_NOT_IN_WHITELIST`), and a scheduled contract call cannot present the governance account's key to `0x167` either (`INVALID_FULL_PREFIX_SIGNATURE_FOR_PRECOMPILE`): the signatures a schedule collects are not in the form the system contract verifies. Point the token's keys at `TokenAdmin`'s contract id instead. `0x167` authorises against its **immediate caller**, so `GOV → executor → TokenAdmin → 0x167` works exactly like a direct call — measured on testnet — but a `delegatecall` on that path would not, and would need a `delegatableContractId` key. Freezing additionally needs the account associated with the token (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, 184). All four operations consume 65k–68k gas through the full chain, so their schedules run with a 90,000 limit.
- **These reads take an EVM address, so a decoded proposal needs no id conversion.** A `tokenAdmin` operation names its token and its account as they came out of the calldata, EIP-55 checksummed, and `decodeScheduledOperation` hands back an account with an alias in hex too — turning one into a `0.0.x` id would take a Mirror lookup of its own. It does not need one: `GET /tokens/{id}`, `GET /contracts/{id}` and the `token.id` filter on `GET /accounts/{id}/tokens` all resolve the `0x…` form, mixed case included (verified on testnet). So `fetchToken`, `fetchTokenRelationship` and `fetchContract` accept both forms, as `fetchAccount` already did. Gating one of these on `isValidEntityId` alone is worse than an error, because a disabled React Query reports `fetchStatus: "idle"` with no data and no error: the card renders its loading state forever.
- **Mirror types the same field differently on different endpoints.** `GET /tokens/{id}` returns `decimals`, `total_supply` and `initial_supply` as **strings** and `expiry_timestamp` as a **number** of nanos, while `GET /accounts/{id}/tokens` returns `decimals` as a **number** and `GET /contracts/{id}` spells the expiry as the usual `seconds.nanos` **string**. A form that multiplies by a string decimals silently produces the wrong amount, so `parseTokenDecimals` takes either shape and is what any amount field reads. It is deliberately stricter than `Number`, which answers 0 for `""`, `" "`, `null` and `[]` and reads `"0x8"` and `"1e2"` as numbers — and the client does not validate the JSON it parses, so a field Mirror left empty arrives typed as a string. The demo token has 0 decimals, which is exactly the value a wrong read produces: the bug would surface only against a real 8-decimal token, as a wrong amount in a governed transfer.
- **Whether an account is frozen is not in the token.** `GET /tokens/{id}` carries `pause_status` and `freeze_default`, which describe the token as a whole and say nothing about a given holder; the per-account state is `freeze_status` on `GET /accounts/{id}/tokens?token.id=…` (`fetchTokenRelationship`). That endpoint answers with an empty list rather than a 404 for an account that never associated the token — the very case in which freezing it would be refused — so an empty answer is a state to show, not an error. Which not-found it is depends on the form of the id: a `0.0.x` account that does not exist gets a 404 there, an EVM address that belongs to no account gets the same empty list. Neither distinction changes what the screen shows — there is no relationship either way.
- **`GET /contracts/{id}` hands back an empty `bytecode`.** The field holds the creation code, which only exists for a contract deployed from a HAPI file; one deployed through the JSON-RPC relay reports `"0x"`. The deployed code is `runtime_bytecode`, and it is the only field a release manifest can be checked against.
- **The HTS system contract reports failure with a response code, not a revert.** A contract that ignores the code turns a refused operation into a successful transaction: the proposal is marked executed and the council's approval is spent on nothing. `TokenAdmin._requireSuccess` reverts with `HtsRejected(code)` so the proposal stays pending and the code reaches Mirror.
- **Token association is a property of the receiving account, not of the contract doing the work.** A contract deployed through the JSON-RPC relay gets unlimited automatic associations (`max_automatic_token_associations: -1`) and receives any token for free; an account created through the SDK gets none unless asked, and associating one afterwards is a separate transaction that the threshold key has to sign. Create the governance account with association slots, and keep the adapter free of token custody so it never needs one.
- Inside a contract, `msg.value` arrives in **tinybars** (8 decimals), not wei: the JSON-RPC relay takes the transaction's `value` in weibars (18 decimals) and divides by 10^10. A contract that treats `msg.value` as an opaque `uint256` and hardcodes no HBAR amount behaves identically on the local EVM and on Hedera; the conversion belongs at the UI boundary.
- **Gas for a contract call that stores caller-supplied `bytes` scales with their length**, so it cannot be a constant. Measured on `GovernedExecutor` on testnet: 4 bytes of calldata consume 100,263, 36 bytes 145,425, 100 bytes 191,355 and 196 bytes 260,251 — a straight line of roughly 23,000 per 32-byte slot, with the jump from 4 to 36 bytes doubled because Solidity stores `bytes` shorter than 32 in a single slot. `createProposalGas` rounds that up generously, which costs nothing because the limit of a plain `ContractExecute` is not charged; falling short costs the whole fee and returns `INSUFFICIENT_GAS`.
- Transaction ids come in two forms: the SDK's `0.0.x@sec.nanos` and Mirror's `0.0.x-sec-nanos` (used in paths). `normalizeTransactionId` accepts both; one id can return several rows (parent plus scheduled/child rows). A signer only returns the transaction id, so the id of a schedule comes from the `SCHEDULECREATE` row of that transaction (`scheduleIdFromTransaction`); the child row's `entity_id` is the contract the scheduled call reached, not the schedule.
- **A schedule can only be withdrawn if it was created with an admin key, and that key has to sign the create.** Without one, `ScheduleDelete` is refused with `SCHEDULE_IS_IMMUTABLE` and the only way out is the expiry; naming a key that does not sign the `ScheduleCreate` fails with `INVALID_SIGNATURE`. Both measured on testnet. That is why the admin key of a proposal is the proposer's own key and never the governance account's: the council's threshold key in that slot would turn opening a proposal into an m-of-n vote of its own.
- **A schedule that executed is not a schedule that succeeded.** Mirror sets `executed_timestamp` as soon as the network runs the scheduled transaction, and a call that reverts runs too — measured on testnet: schedule `0.0.10670585`, a `TokenAdmin` freeze of an account that never associated the token, reads as executed while its scheduled row says `CONTRACT_REVERT_EXECUTED`. `executed_timestamp` is that row's `consensus_timestamp`, so `GET /api/v1/transactions?timestamp=<executed_timestamp>` returns exactly the scheduled row (`scheduled: true`) and its `result` (`fetchScheduleExecution`; the endpoint answers an empty list, not a 404, until it is indexed). `deriveScheduleState` still says `executed` for both, and `Proposal.execution` says `succeeded` or `failed`. A revert leaves the registry entry as it was, so a pending entry is retried by scheduling `execute(id)` again, not by proposing it again; and since a schedule runs once, nothing live points at the entry any more and Cancel is safe (`cancellableRegistryId`).
- **Withdrawing a proposal has two layers, and they answer different questions.** `ScheduleDelete` ends one round of approval — the registry entry stays pending and anyone can schedule `execute(id)` again. `GovernedExecutor.cancel(id)` ends the proposal for good, and the proposer can call it straight, with no schedule and no quorum. A schedule left alive for a cancelled proposal is a trap: reaching its threshold reverts with `ProposalNotPending` and the governance account pays the gas consumed, so delete the schedule first and cancel afterwards. A native proposal (a council rotation through `AccountUpdate`) has no registry entry, so there the delete is the only retraction.
- **Rotating a threshold key needs signatures from both councils, and the schedule waits for them.** Measured on testnet with throwaway accounts: a scheduled `AccountUpdate` that replaces an account's threshold key did **not** run on the outgoing council's threshold alone — the schedule simply stayed pending — and ran as soon as the incoming key's own threshold was also met. Each side needs its **own threshold**, not all of its members: 2-of-3 outgoing plus 2-of-3 incoming was enough. So a council rotation has two progress counts, and `countThresholdSignatures` against the current council alone would show a bar that can never fill. The incoming council is in the decoded body (`decodeScheduledOperation` returns it as a `CouncilKey`), so the inbox counts both: `Proposal.progress` against the council that exists and `Proposal.incomingProgress` against the one being proposed, null for every other kind.
- **A decoder that describes only part of a body is worse than one that describes none of it**, because the council approves what it was shown. Matching a selector says nothing about the argument behind it — `execute(uint256)` with a truncated argument makes viem throw — and `CryptoUpdate` carries around twenty fields besides the key, so a rotation that also set the account's expiry would read as a plain rotation. The rule in `decode.ts` is that a field it does not read makes the body `unrecognized`, checked by re-encoding what was understood and comparing it against what arrived.
- **An entity can be named by an EVM address or a key alias instead of a number**, and there is no converting one to the other without the Mirror Node. Reading only `contractNum` / `accountNum` renders all of them as `0.0.0` — a real account, and the wrong one — so the address is carried through as it came, and anything comparing contracts has to accept both forms (`isThisExecutor`).
- **A revert is an answer, not a failed read.** `proposal(id)` reverts on an id that was never registered, which is a proposal nobody should sign; viem reports it as a nested `ContractFunctionRevertedError`, distinguishable from a transport failure by walking the error. The cross-check returns `missing` for the first and `unreachable` for the second, and only the second is a warning rather than a gate.
- **The JSON-RPC relay answers from a block or two back.** A registry entry cancelled seconds ago can still read `Pending`, so the cross-check between a schedule and its entry is eventually consistent in the same way Mirror reads are. It is a warning on a row, never a gate: a relay that cannot be read leaves the row uncrossed rather than emptying the inbox.
- **A decoded address comes back EIP-55 checksummed** whatever casing the calldata carried, so compare one against an address read elsewhere case-insensitively rather than with `===`.
- **The bytes the SDK writes for a scheduled body are not the bytes Mirror serves.** The SDK spells out an empty memo and zero shard and realm that the network leaves off the wire, so a round trip through `scheduledBodyOf` has to be asserted on the decoded operation and never on the base64.
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
4. **Tests** next to the code (`*.test.ts`): assert the transaction shape (type, payer, memo, batch key) with the SDK, mock the wallet and Mirror calls, never hit the network. What only the network can settle goes in a `*.integration.test.ts` that skips without credentials (`services/governance/schedules.integration.test.ts`).
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
