# Agent instructions

Briefing for coding agents in this app (Cursor, Claude Code, Codex). Claude Code loads it through `CLAUDE.md`.

This is a **Hedera template with four workspaces**: `packages/core` (the governance domain and the Mirror Node client — no React, no Next.js, so the app and any service can share one copy), `packages/agent` (a co-signing service that holds one seat on the council and signs what its policy allows), `packages/nextjs` (the governance UI, HashPack signing through WalletConnect, a SaucerSwap-backed swap provider, and `yarn setup`) and `packages/hardhat` (Solidity contracts deployed through the Hedera JSON-RPC relay). Native writes are Hiero SDK transactions signed by the user's wallet in the app, by the agent's own key, or by the operator in `yarn setup` and the release script; contract deploys go through Hardhat and regenerate `packages/nextjs/contracts/deployedContracts.ts`. The product is governed operations: proposals a council approves m-of-n through the governance account's threshold key and the Schedule Service, which the network executes once the threshold is met.

The governance UI owns `/` as the **live map**: `app/(governance)/layout.tsx` hosts `/`, `/governance/[scheduleId]`, `/governance/new` and `/settings` as one fold below the header — a map pane (treasury figures and the council's threshold, the map) that never scrolls, and a right rail that renders the route's page (the pending proposals, a proposal's detail with Sign, Withdraw and Cancel, or the wizard). The layout runs the setup guard once and provides the config (`useGovernanceConfig()`) and the wizard's draft (`ProposalWizardProvider`) to both panes. The screens are backed by `useProposals`, `useProposalLookup`, `useTreasuryFigures` and the mutation hooks (`useCreateProposal`, `useCreateNativeProposal`, `useSignProposal`, `useWithdrawProposal`, `useCancelProposal`, and `useCancelProposalFlow`, which deletes a live schedule before cancelling its entry). The header links Live map and Settings. `/settings` shows the council read from the treasury account's key, a composer that proposes a change to it (native, wallet-signed) and the registry's roles (read over the relay, read-only). `/governance/new` opens a proposal: a vault upgrade, a token pause or freeze, a supplier payment in HBAR or a token, or seating the co-signing agent on the council (a rotation that keeps every member and the threshold) — previewed through the same decoders the detail page uses. See `docs/GOVERNANCE_UI.md` for how the screens are built (layout, setup guard, which actions a proposal offers and to whom, the copy for its state) before working in this area.

Use Yarn (`packageManager` in the root `package.json`). Never switch the workspace to npm or pnpm.

## Commands

```bash
yarn setup              # idempotent testnet bootstrap; writes ids to packages/nextjs/.env.local
yarn next:dev           # http://localhost:3000
yarn next:build
yarn next:check-types
yarn lint               # core:lint + agent:lint + next:lint + hardhat:lint
yarn test               # core:test + agent:test + next:test (Vitest, *.test.ts(x)) + hardhat:test
yarn format

yarn core:check-types   # the shared domain under packages/core/
yarn core:lint
yarn core:test

yarn release:publish --contract AcmeVault --version v2.0.0   # release manifest to the HCS topic
yarn agent:start        # the co-signing agent; see packages/agent/README.md
yarn agent:check-types
yarn agent:lint
yarn agent:test

yarn hardhat:compile    # contracts under packages/hardhat/contracts/
yarn hardhat:test
yarn hardhat:check-types
yarn hardhat:deploy --network hederaTestnet   # also rewrites packages/nextjs/contracts/deployedContracts.ts
yarn hardhat:verify:testnet                   # Sourcify, prints the HashScan link
```

`*.integration.test.ts` files talk to testnet and skip themselves unless `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_PRIVATE_KEY` are exported in the shell and `yarn setup` has written `setup-state.json`, so `yarn test` and CI need no credentials.

Copy `packages/nextjs/.env.example` → `packages/nextjs/.env`. Required for signing from the browser: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`. Required for `yarn setup` and the scripts that sign with the operator (`yarn release:publish`, `yarn harness:council-seat`): `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`, `HEDERA_NETWORK=testnet`. `yarn setup` (`packages/nextjs/scripts/setup.ts`) writes the demo ids (`NEXT_PUBLIC_RELEASE_TOPIC_ID`, `NEXT_PUBLIC_DEMO_ACCOUNT_*_ID`, `NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID`, `NEXT_PUBLIC_DEMO_TOKEN_ID`, `NEXT_PUBLIC_SEED_PROPOSAL_ID`, `NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID`, and `AGENT_DECISION_TOPIC_ID` for the agent to copy into its own `.env`) to `.env.local`. The co-signing agent gets an account of its own, **outside** the council, and the decision topic is created with that account's key: the council seats it by approving "Add the co-signing agent", which is the journey the agent exists to show. It also requires `HEDERA_COUNCIL_ACCOUNT_ID`, the account of yours that becomes a member of the governance threshold key. It refuses mainnet, keeps ids and demo keys in `packages/nextjs/setup-state.json` (gitignored) and verifies them on the Mirror Node before creating anything. It also associates the treasury swap's output token on the governance account, signed by the two demo council seats, which a swap cannot do for itself; product-specific fixtures go in the hooks of `scripts/setup/extensions.ts`.

**`yarn setup` runs twice, on either side of `yarn hardhat:deploy`** (`docs/RUNBOOK.md` §3). The dependency is circular and crosses the workspace boundary: `GovernedExecutor`'s constructor takes the governance account's address and the proposer list, and the setup script is what creates that account; the demo token's pause and freeze keys are `TokenAdmin`'s contract id, and a token created without an admin key can never have them changed. So the first run creates the account and writes `GOVERNANCE_ACCOUNT_ADDRESS` and `INITIAL_PROPOSERS` into `packages/hardhat/.env`, the deploy runs, and the second run creates the token and the seed proposal. A third run creates nothing. **A complete `deployedContracts.ts` is not proof of a deploy**: the template ships it with its demo instance's contracts (the app browses them without a `.env`), so before building on it the setup asks the executor over the relay whether it grants `EXECUTOR_ROLE` to this governance account (`readOwnDeployment`), and stops with the deploy commands when it does not. `PROPOSER_ROLE` cannot be granted after the deploy — the role's admin is the contract itself, so it would take an approved proposal — which is why the proposer list is composed before it. `.env.example` is the single list of documented variables: add new ones there with an empty value. Never commit `.env` or `.env.local`.

## App overview

| Route                      | Purpose                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Live map — map pane (treasury figures, council threshold) beside a rail listing pending proposals, settled ones below under "Recent"; the selected one (`?schedule=`) opens its detail under its card; selecting a proposal previews what it would do on the map; the template's published testnet instance, with a notice, until `yarn setup` writes your own ids |
| `/governance/[scheduleId]` | One proposal by schedule id: decoded operation, registry state, gas and HBAR, approvals; Sign / Withdraw / Cancel (wallet-signed)                                                |
| `/governance/new`          | Open a proposal — pick an operation, see what the council will see, register and/or schedule it (wallet-signed); the map previews the draft as it is written                                                               |
| `/settings`                | Settings — council (threshold key, Mirror), council-change composer (wallet-signed, native), registry roles (relay, read-only)                                                   |

Config: `packages/nextjs/config/governanceConfig.ts` (the ids `yarn setup` writes, deployed contract lookup).

## Layout

```
packages/core/            @sh/core — the domain, with no framework in it
  src/
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
      roles.ts              Role reads over the relay: EXECUTOR_ROLE holders, the roles' admins
      proposals.ts          The inbox: schedules by proposer, narrowed to the governance account's, with m-of-n
      proposalTypes.ts      The five kinds, their measured execute gas, and the shapes a decoded proposal takes
      encode.ts             Form values to transactions: the five encoders, the registration gas, createProposal
      decode.ts             Scheduled body and registry calldata back to a described operation
      registry.ts           GovernedExecutor: the entry behind a proposal, cancel, and the id a create returned
      scheduledBody.ts      The body a schedule carries, built from its transaction (the wizard's preview)
      releaseManifest.ts    What a release publishes to HCS, and whether an implementation's deployed code matches it
      decisionLog.ts        What the agent publishes per decision, and the submit key that makes it evidence
    relayClient.ts        The viem client every read through the JSON-RPC relay goes through
    identity.ts           EVM address / account id predicates and formatting
    network.ts            HederaNetworkName and the narrowing of an env value to it
packages/agent/           @sh/agent — one seat on the council, signing under a written policy
  src/
    policy.ts             The limits, one typed check per kind of operation
    operation.ts          Proposal to the flat operation a policy reads, and every reason one cannot be read
    review.ts             One pass over the inbox: decide, then sign what passed
    totp.ts               RFC 6238: which step a code belongs to, never whether it may be used
    approvals.ts          Proposals waiting on a person, the replay guard, where a notification hooks
    approvalServer.ts     POST /approvals/{scheduleId} on node:http, one route, loopback by default
    publish.ts            Which decisions reach the audit topic, and what a record must never claim
    config.ts             Environment and policy file, both validated at boot
    index.ts              The loop, the Hedera client and the JSON log
  policy.example.json     The shape of a policy; it is mounted, not baked into the image
  Dockerfile              Built from the repository root, since the agent shares @sh/core with the app
packages/nextjs/
  app/                    App Router pages
    (governance)/         layout.tsx: the live map — setup guard, GovernanceProvider, map pane + rail; page.tsx (/), governance/[scheduleId], governance/new
  components/             Header (nav, MirrorPollStatus, network, theme, wallet), ConnectWallet, SetupNotice, …
    governance/           GovernanceProvider (config + wizard draft for the live map), LiveMapPane (the map pane: TreasuryStrip with AnimatedNumber figures, map) over useLiveMap (its reads, motion, node states, remote signatures, inspector, preview), RailNotice (the rail's banner), MutationError, the proposal wizard (ProposalWizardProvider + ProposalWizard, picker, preview; one folder per kind under wizard/kinds/, listed in kinds/registry.ts) and rail/ (pending list, operation cards, search, proposal detail)
    governance/graph/     GovernanceMap → GovernanceGraph: the SVG governance map (nodes, edges, comets, ring, legend), MapInspector + inspector.ts (the card for a selected node or edge), MapDecoratorProvider + useComposedMap (the host's layout, shared with the rail), MapCaptionLine + caption.ts and useMapPreview (the line over the map and the preview of the rail's draft or selected proposal); copy.ts holds its words
    governance/graph/demo/  Demo only: hand-composed layout, names, the co-signing agent — a ghost until a rotation proposes it or the council seats it (deletable)
    governance/settings/  Settings: CouncilCard, CouncilChangeComposer (+ councilChange.ts, the composer's rules), ContractRolesCard (+ registryRoles.ts), copy.ts
  hooks/
    useHederaSigner.ts    Wallet session + Hedera account identity for the UI
    useProposalAnimationSync.ts  The map's queue: plays each read's events one at a time on a held world
    usePrefersReducedMotion.ts   The reduced-motion setting, followed live
    useRemoteApprovals.ts  Approvals a read reports that this session did not send (the rail's banner)
    governanceMutationKeys.ts  Mutation keys of the governance writes, read back with useMutationState
    mirror/               React Query hooks over @sh/core/mirror
      useSchedule.ts        Schedule + derived state + execution outcome; polls until the outcome is final
      useProposals.ts       The council's proposals; polls fast while any is open, slowly once all settled
      useRegistryRoles.ts   EXECUTOR_ROLE holders and role admins; cached
      useProposalLookup.ts  One proposal by schedule id, listed or not; the detail page and the rail's search
      sentCancels.ts        Cancels just sent, kept reading "cancelled" until the relay catches up
      useCouncil.ts         Members, threshold and proposers; cached, since only a passed proposal changes them
      useReleaseCheck.ts    Whether a published release vouches for an upgrade's implementation (the agent's check)
      useTreasuryFigures.ts Treasury balances plus the vault's reserve
      useInboxUpdatedAt.ts  When any inbox on a network was last read, from the query cache (the header's "polled Xs ago")
      useRefreshOnSettle.ts Re-reads treasury figures (the council after a rotation; the entry, the vault's code and the tokens after a registry call) when a proposal settles
      useMapSnapshot.ts     Inbox, council, treasury and the vault's and token's states as one snapshot, plus the events since the previous read
      useVaultImplementation.ts  The code the vault's proxy runs; re-read when a registry call settles
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
    governance/           What governance needs from the app: the screens' rules and words, the wizard's drafts, the integration tests
      treasury.ts           Treasury balances plus the vault's reserve
      vaultImplementation.ts  The vault proxy's implementation address, from its ERC-1967 slot
      proposalActions.ts    Which actions a proposal offers (Sign, Withdraw, Cancel), and to whom
      proposalLabels.ts     The words a screen uses for a proposal's status, registry entry and approvals
      drafts/               Form values to an encoded draft, one module per kind; draft.ts reads the preview back through decode.ts
    liveMap/              The live map, pure; depends on governance/, never the reverse
      model/                proposalRoutes.ts (the path each kind takes, in roles), graph.ts (nodes, edges, a proposal's scope, the fallback layout), graphEntities.ts (the configured contracts, token and DEX router the graph starts from)
      events/mapEvents.ts   Snapshot diff: proposed / approved / executed / reverted / councilChanged, fresh ones only
      motion/               How the map moves: timings, sequences (cues as data), frame (what is lit at a cue), queue (order, dedupe, held world)
      remoteApprovals.ts    Which approvals of a read this session did not send
      preview/              What the map previews: previewSource.ts (draft / selected proposal → MapPreview), previewFrame.ts (MapFrame for it), kinds/ (one module per kind: its "would …" words and the route it sketches before the form is filled; registry.ts lists them)
    swap/                 SwapProvider interface + SaucerSwap V2 implementation
    operatorKey.ts        Parses HEDERA_OPERATOR_PRIVATE_KEY for yarn setup and the scripts (never the app)
  utils/scaffold-hbar/    Hedera tx helpers, identity, networks, waitForMirrorIndexing
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

- **Hiero SDK** (`@hiero-ledger/sdk`) builds every transaction, on the client and on the server. No `ethers`/`viem` calls for Hedera writes. `packages/core` also declares **`@hiero-ledger/proto`** at an exact version, to decode the governance account's threshold key; it is the version the SDK already resolves. **The app installs one physical copy of each.** A transaction built in `@sh/core` is signed in `@sh/nextjs`, by the agent and by `@hashgraph/hedera-wallet-connect`, and a second copy of the SDK is a second `Transaction` class: it type-checks, and the wallet's `instanceof` then rejects the transaction at runtime. The root `.yarnrc.yml` keeps upstream's `nmHoistingLimits: workspaces`, which gives every workspace its own copy of what it declares, so `core`, `agent` and `nextjs` opt out with `installConfig.hoistingLimits: "none"` and share the root `node_modules`; `hardhat` stays isolated. **Upgrade the two together**, then check with `yarn why @hiero-ledger/proto` that `@sh/core` and the SDK resolve the same version, and with `find . -path '*/node_modules/@hiero-ledger/sdk/package.json' -not -path '*/hedera-harness/*'` (and the same for `proto`) that the only copy is under the root `node_modules` — `yarn why` reads the lockfile and cannot see a duplicate install; `hedera-harness` carrying its own is expected. `services/web3/sdkSingleCopy.test.ts` fails if the class splits again. Raising the SDK alone leaves the SDK on its own newer `proto` while the domain imports the older one by name, which nothing fails on today and is exactly the kind of drift found late.
- **`yarn install` prints ~25 peer-dependency warnings, and none of them affects runtime.** Seventeen name one of our workspaces and eight are between third parties; the counts and the split are unchanged from the upstream scaffold this template tracks, whose `.yarnrc.yml` this one matches byte for byte. Most are true statements about deliberate choices — wagmi 3 against packages that ask for wagmi 2, `next-themes` 0.3 against React 19 — so they are left visible rather than silenced with `packageExtensions`, which would mean asserting we know better than six packages about their own peers. Two warnings mentioning `@hiero-ledger/sdk@2.88.0` come from `hedera-harness`'s own tree, not from the app.
- **HashPack via WalletConnect**: `@hashgraph/hedera-wallet-connect` + Reown AppKit (`services/web3/appKitHedera.ts`, `hederaWalletConnect.tsx`). The wallet exposes `hedera_signAndExecuteTransaction` and `hedera_signTransaction`; the app never holds a user key. Both ED25519 and ECDSA accounts work. `components/ConnectWallet.tsx` is an inline connect/disconnect control that shows wallet rejections as a message.
- **Signing port** (`services/web3/hederaSignerPort.ts`): `HederaSigner = { kind, accountId, network, executeTransaction, signTransaction }` with two implementations — `hashPackSigner.ts` (the WalletConnect session) and `burnerSigner.ts` (an ECDSA key read from `localStorage["burnerWallet.pk"]`, the key Hedera Harness CHAIN injects). `hooks/useHederaSigner.ts` picks one and exposes `executeTransaction(tx)`, `signTransaction(tx)` (sign only, returns the signed `Transaction`), `requireAccountId()`, `signerKind` and `disconnect()`; components never know which signer is active.
- **Mirror Node REST** for all reads (`@sh/core/mirror`): typed responses, `MirrorNodeError` on non-2xx, `mirrorGetAllPages` for `links.next`. Reads are public, so the hooks in `hooks/mirror/` call the Mirror Node directly from the client: `useTopicMessagesFeed` returns decoded messages (`text`, and `json` when the payload parses); `useSchedule` / `useTransaction` poll every 5 s while pending or not yet indexed (404) and stop once settled; queries stay disabled while the id is empty or malformed. It is eventually consistent: expect a few seconds of lag after a transaction reaches consensus.
- **Identity**: account IDs use the `0.0.xxxxx` form; `utils/scaffold-hbar/hederaIdentity.ts` normalizes EVM ↔ native identity and builds CAIP ids for the wallet.

### Signing conventions

- **Wallet-signed (client)**: build the transaction with the SDK and hand it to `useHederaSigner` (`executeTransaction` / `signTransaction`); the active signer freezes it with a network `Client`. Use this for anything the user owns or pays for: opening, signing, withdrawing or cancelling a proposal. Read the payer with `requireAccountId()`, not from the wallet provider, so the code works with both signers.
- **Test signer (burner)**: `services/web3/BurnerSignerProvider.tsx` reads `localStorage["burnerWallet.pk"]` on load, resolves the account id from the key's EVM alias through the Mirror Node (`GET /api/v1/accounts/0x…`, retried for indexing lag) and takes precedence over HashPack. `burnerSigner.ts` signs with `freezeWith(client)` + `execute(client)` / `sign(key)`; the burner is the client's operator. It only activates on testnet and, in production builds, only when `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true` (`burnerSignerPolicy.ts`). The header shows the account with a "test signer" badge; "Disconnect" forgets the key. This is the burner-wallet pattern of the Hedera Harness x402 recipe ([hedera-dev/hedera-harness](https://github.com/hedera-dev/hedera-harness)), adapted to native signing since HashPack cannot be driven by Playwright. `BurnerSigner.publicKey` is the extension point for demo modes that need the ephemeral account on-chain (e.g. as a threshold-key member); a payer-only demo needs nothing beyond `chainValidation.fundingHbar`.
- **Operator key (scripts only)**: no page or route signs with the operator. Only `yarn setup`, `yarn release:publish` and `yarn harness:council-seat` read `HEDERA_OPERATOR_*` (the key is parsed by `services/operatorKey.ts`), in Node. Never expose it to the client or prefix it with `NEXT_PUBLIC_`.
- **Freeze before execute**: always `freeze()` / `freezeWith(client)` a transaction before signing or serialising it. A frozen transaction has its transaction id and node account ids fixed; an unfrozen one cannot be signed by an external wallet.
- **Batch inner transactions (HIP-551)**: for an inner transaction the wallet signs and the server batches, set `setTransactionId(TransactionId.generate(payer))`, `setBatchKey(serviceKey)`, then `freeze()`. Do **not** call `setNodeAccountIds`: it locks the node list and `freeze()` can no longer pin node `0.0.0`, which a batch requires. The service adds the signed inner tx to a `BatchTransaction` and executes it with the batch key.
- **Wallet rejections** arrive as WalletConnect JSON-RPC errors (`code` 5000–5003, EIP-1193 `4001`, or a `USER_REJECT` message); `hederaSigner.ts` maps them to `WalletRejectedError` (`isWalletRejection`) so components can show a message instead of a crash.
- **Expired approvals**: a transaction's valid duration (the SDK's default is 120 s) runs from the valid start in its transaction id — set before the wallet shows it, and by the SDK a few seconds in the past — so an approval that takes longer is refused at precheck with `TRANSACTION_EXPIRED` — nothing sent, nothing charged. A wallet relays it as HIP-820 `{ code: 9000, message, data: "4" }`, a plain object — verified against the reference `HIP820Wallet` in `hedera-wallet-connect` only; HashPack's exact shape is still to be confirmed live; `hederaSigner.ts` maps it to `TransactionExpiredError` (`isTransactionExpired`) carrying the transaction's valid duration, and `MutationError` says to try again within it. The network only answers once the wallet submits, so a request left unanswered in HashPack never settles: governance writes go through `useExecuteBeforeDeadline` (`hooks/useWalletRequest.ts`), which sets the transaction id itself and stops waiting at valid start + valid duration with a `WalletRequestExpiredError` ("reject it in HashPack, then try again"). A late success — possible only when the local clock runs ahead of the network's — is kept: all queries are refreshed and the caller's `onLateSuccess` runs.
- **After a write, poll the Mirror Node** until the entity appears: wrap the read in `waitForMirrorIndexing` (`utils/scaffold-hbar/waitForMirrorIndexing.ts`), as `useCreateProposal` and `useCreateNativeProposal` do with `fetchTransaction` + `scheduleIdFromTransaction`; typically 3–20 s. Never assume a read right after `execute` reflects the write.

### Verified traps

- `DAppSigner.freezeWithSigner` (`hedera-wallet-connect` 2.1.x) does **not** set node account ids; freeze with a `Client.forTestnet()` / `forMainnet()` before `executeWithSigner` or the wallet call fails.
- Mirror `GET /schedules?account.id=X` filters by **creator** of the schedule (`creator_account_id`), not by `payer_account_id`; querying with the payer returns an empty list. See `fetchSchedulesByCreator`.
- **A schedule's `m of n` is not `signatures.length`.** Mirror records a row for every key that signed anything touching the schedule, and two kinds never count toward the threshold: the row `ScheduleCreate` adds for whoever paid to open the proposal, and the row every `ScheduleSign` adds for whoever paid to submit it. Measured on testnet, an executed 2-of-3 proposal shows **four** rows ([schedule 0.0.10716564](https://hashscan.io/testnet/schedule/0.0.10716564)) — two members and the payer twice. Count **council members, not rows** (`countThresholdSignatures`): a member is in or out however many rows carry its key. Do not discard every creator signature either — when the proposer holds a seat, which is what the demo does, it counts once and legitimately.
- **The members of a threshold key come back as an opaque blob.** Mirror returns the governance account's key as `_type: "ProtobufEncoded"`, so `fetchCouncilKey` decodes it with `@hiero-ledger/proto` — the package the Hiero SDK already depends on, so it adds nothing to the bundle (its version follows the SDK's; see **Stack**). Read it from the ledger, never from env: rotating the council is itself a proposal. Match a signature to a member in **hex**, since `public_key_prefix` is a prefix and base64 packs three bytes into four characters.
- **Mirror has no query for "proposals of the governance account".** `GET /schedules?account.id=X` filters by creator, and a proposal is defined by its payer, so the inbox is the union of the schedules each `PROPOSER_ROLE` holder created, narrowed to the ones the governance account pays for. A native proposal needs no role, so one opened outside it is never listed — accepted, and reachable by its schedule id.
- Reading a contract from the browser goes through the **JSON-RPC relay** (`createPublicClient` + `getHederaRpcUrl`), not `ContractCallQuery`: there is no operator key on the client. Under jsdom viem's fetch fails on a cross-realm `AbortSignal`, so tests that read a contract run with `// @vitest-environment node`.
- Mirror Node lag: reads right after consensus return 404 or stale pages. Retry with backoff (`waitForMirrorIndexing`) instead of failing.
- Swap quoting must be **on-chain** (`QuoterV2` or the pool's `sqrtRatioX96`). Reserve numbers from the SaucerSwap API do not give the concentrated-liquidity price; using them for `amountOutMinimum` reverts with `Too little received` ([tx](https://hashscan.io/testnet/transaction/1789670531.424417104), an early proof of concept). `QuoterV2.quoteExactInputSingle` is not `view` — it simulates the swap and reverts internally — so it has to go through the relay's `eth_call` (`createJsonRpcQuoter`); the SDK's `ContractCallQuery` rejects it in precheck with `INSUFFICIENT_GAS` at any gas value.
- **The gas limit on a scheduled contract call is a price, not a ceiling.** A scheduled call that succeeds is charged the whole limit; one that reverts is charged only what it consumed ([schedule 0.0.10716564](https://hashscan.io/testnet/schedule/0.0.10716564): 150,000 × 109 tinybar for 65,410 consumed; [schedule 0.0.10765677](https://hashscan.io/testnet/schedule/0.0.10765677): 306,298 × 109 of a 320,000 limit). At 109 tinybar per gas unit a 1,500,000 limit prices a swap at 1.6350 HBAR against 0.3161 for a 290,000 one — arithmetic, stated as such, because no swap has run at either limit. So the limit belongs to the operation, not to a shared constant — an upgrade proposal consumes 65,410 ([schedule 0.0.10716564](https://hashscan.io/testnet/schedule/0.0.10716564)) and a treasury swap 247,047 ([schedule 0.0.10766696](https://hashscan.io/testnet/schedule/0.0.10766696)), and the governance account pays the difference for any headroom left unused. `PROPOSAL_TYPES` carries one limit per kind for that reason, and **a `Measured:` comment there cites the transaction it came from**: the swap's figure once read 241k and came from a Hardhat run against a mock router, while the real swap was reverting at every limit it was given. A number a mock produced describes the mock. A **plain** `ContractExecute` is the opposite and the two are easy to confuse: the same `createProposal` cost 0.2086 HBAR at a 400,000 limit and at a 1,200,000 one, both consuming 191,355 ([400k](https://hashscan.io/testnet/transaction/1790352763.644093911), [1.2M](https://hashscan.io/testnet/transaction/1790352768.393710104)), so headroom outside a schedule is free. Note also that the consumption of a scheduled `execute` depends on the calldata the entry stores, not only on its kind, so an upgrade with an initializer nested in it does more work than one without.
- **An HTS token key can be a contract id, and that is the only way a council governs a token.** A scheduled `TokenPause` is refused (`SCHEDULED_TRANSACTION_NOT_IN_WHITELIST`, [tx](https://hashscan.io/testnet/transaction/1789669916.603630104)), and a scheduled contract call cannot present the governance account's key to `0x167` either (`INVALID_FULL_PREFIX_SIGNATURE_FOR_PRECOMPILE`, [schedule 0.0.10590524](https://hashscan.io/testnet/schedule/0.0.10590524); both on an early proof-of-concept deployment): the signatures a schedule collects are not in the form the system contract verifies. Point the token's keys at `TokenAdmin`'s contract id instead. `0x167` authorises against its **immediate caller**, so `GOV → executor → TokenAdmin → 0x167` works exactly like a direct call — measured on testnet ([tx](https://hashscan.io/testnet/transaction/1790713605.639168721)) — but a `delegatecall` on that path would not, and would need a `delegatableContractId` key. Freezing additionally needs the account associated with the token (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, 184; [schedule 0.0.10670585](https://hashscan.io/testnet/schedule/0.0.10670585)). Measured through the full chain as plain `ContractExecute` calls from the governance account, the four consume 65,084–67,789 gas ([pause](https://hashscan.io/testnet/transaction/1790713605.639168721), [unpause](https://hashscan.io/testnet/transaction/1790713612.767008908), [freeze](https://hashscan.io/testnet/transaction/1790713650.494400104), [unfreeze](https://hashscan.io/testnet/transaction/1790713661.606658104)), so their schedules run with a 90,000 limit (`PROPOSAL_TYPES` cites the transactions). A freeze has to name an aliased holder by its EVM alias: the long-zero address of an account with one is refused as `INVALID_ACCOUNT_ID` (15; [tx](https://hashscan.io/testnet/transaction/1790713623.226064483)).
- **These reads take an EVM address, so a decoded proposal needs no id conversion.** A `tokenAdmin` operation names its token and its account as they came out of the calldata, EIP-55 checksummed, and `decodeScheduledOperation` hands back an account with an alias in hex too — turning one into a `0.0.x` id would take a Mirror lookup of its own. It does not need one: `GET /tokens/{id}`, `GET /contracts/{id}` and the `token.id` filter on `GET /accounts/{id}/tokens` all resolve the `0x…` form, mixed case included (verified against the testnet Mirror Node; a read, so there is no transaction to link). So `fetchToken`, `fetchTokenRelationship` and `fetchContract` accept both forms, as `fetchAccount` already did. Gating one of these on `isValidEntityId` alone is worse than an error, because a disabled React Query reports `fetchStatus: "idle"` with no data and no error: the card renders its loading state forever.
- **Mirror types the same field differently on different endpoints.** `GET /tokens/{id}` returns `decimals`, `total_supply` and `initial_supply` as **strings** and `expiry_timestamp` as a **number** of nanos, while `GET /accounts/{id}/tokens` returns `decimals` as a **number** and `GET /contracts/{id}` spells the expiry as the usual `seconds.nanos` **string**. A form that multiplies by a string decimals silently produces the wrong amount, so `parseTokenDecimals` takes either shape and is what any amount field reads. It is deliberately stricter than `Number`, which answers 0 for `""`, `" "`, `null` and `[]` and reads `"0x8"` and `"1e2"` as numbers — and the client does not validate the JSON it parses, so a field Mirror left empty arrives typed as a string. The demo token has 0 decimals, which is exactly the value a wrong read produces: the bug would surface only against a real 8-decimal token, as a wrong amount in a governed transfer.
- **Whether an account is frozen is not in the token.** `GET /tokens/{id}` carries `pause_status` and `freeze_default`, which describe the token as a whole and say nothing about a given holder; the per-account state is `freeze_status` on `GET /accounts/{id}/tokens?token.id=…` (`fetchTokenRelationship`). That endpoint answers with an empty list rather than a 404 for an account that never associated the token — the very case in which freezing it would be refused — so an empty answer is a state to show, not an error. Which not-found it is depends on the form of the id: a `0.0.x` account that does not exist gets a 404 there, an EVM address that belongs to no account gets the same empty list. Neither distinction changes what the screen shows — there is no relationship either way.
- **`GET /contracts/{id}` hands back an empty `bytecode`.** The field holds the creation code, which only exists for a contract deployed from a HAPI file; one deployed through the JSON-RPC relay reports `"0x"`. The deployed code is `runtime_bytecode`, and it is the only field a release manifest can be checked against. **Hash what the network reports, on both sides.** The local artifact's `deployedBytecode` is not the same bytes — immutable variables and the metadata suffix are settled at deploy time — so a publisher that hashes the artifact would produce a manifest nothing ever matches. `yarn release:publish` reads `runtime_bytecode` from Mirror for exactly that reason, which is also what makes the check repeatable by hand from HashScan.
- **An HCS topic created without a submit key takes a message from anyone, and that cannot be fixed afterwards.** A topic is only evidence of who wrote to it if the network refuses everyone else, so a release log, a decision log or any feed a check reads needs `setSubmitKey` at creation. Without an `adminKey` the topic is immutable and no key can be added later — the only repair is a new topic and a new id everywhere that referenced it. The release and decision topics have one, and `assertTopicIsSigned` is what stops the agent from treating an open one as a source of releases or as a log of its own decisions. **Whose key it is follows from what the messages claim**: a release manifest says "this team published this build", so the operator holds that topic; a decision says "this agent approved this proposal", so the agent holds that one, and the agent refuses to start if the topic's single submit key is not its own — every message it sent would come back `INVALID_SIGNATURE`.
- **The HTS system contract reports failure with a response code, not a revert.** A contract that ignores the code turns a refused operation into a successful transaction: the proposal is marked executed and the council's approval is spent on nothing. `TokenAdmin._requireSuccess` reverts with `HtsRejected(code)` so the proposal stays pending and the code reaches Mirror.
- **Token association is a property of the receiving account, not of the contract doing the work.** A contract deployed through the JSON-RPC relay gets unlimited automatic associations (`max_automatic_token_associations: -1`) and receives any token for free; an account created through the SDK gets none unless asked, and associating one afterwards is a separate transaction that the threshold key has to sign. Create the governance account with association slots, and keep the adapter free of token custody so it never needs one.
- **Association slots are not enough when the token arrives from inside a contract call, and the failure looks like anything but that.** An automatic association performed by the HTS system contract is charged to the call as gas, at the association fee rather than the transfer fee. Measured on testnet ([schedule 0.0.10765677](https://hashscan.io/testnet/schedule/0.0.10765677), read through `/actions`): the treasury swap's output transfer was handed 169,373 gas, consumed all of it and returned `INSUFFICIENT_GAS`, and SaucerSwap's pool turned that into `TransferFail(21)` — 21 is `UNKNOWN`, the code Hedera's helper substitutes when the system call itself fails, so the argument names nothing. Associated, the same transfer costs 15,284 ([schedule 0.0.10766696](https://hashscan.io/testnet/schedule/0.0.10766696)). Two lessons past the swap: **a system-contract call that comes up short burns every unit left in its frame**, so "it consumes ~95 % of any limit you give it" is the signature of this failure and not evidence against gas; and the fix belongs in `yarn setup` rather than in the limit, because a scheduled call that succeeds pays its whole limit and an association happens once. Read `/api/v1/contracts/results/{hash}/actions` to see which frame failed — `error_message` alone only carries the lid the outermost contract put on it.
- Inside a contract, `msg.value` arrives in **tinybars** (8 decimals), not wei: the JSON-RPC relay takes the transaction's `value` in weibars (18 decimals) and divides by 10^10. A contract that treats `msg.value` as an opaque `uint256` and hardcodes no HBAR amount behaves identically on the local EVM and on Hedera; the conversion belongs at the UI boundary.
- **Gas for a contract call that stores caller-supplied `bytes` scales with their length**, so it cannot be a constant. Measured on `GovernedExecutor` on testnet: 4 bytes of calldata consume 100,263, 36 bytes 145,425, 100 bytes 191,355 and 196 bytes 260,251 ([4](https://hashscan.io/testnet/transaction/1790352775.438187587), [36](https://hashscan.io/testnet/transaction/1790352780.213453104), [100](https://hashscan.io/testnet/transaction/1790352784.858183632), [196](https://hashscan.io/testnet/transaction/1790352789.600630416)) — a straight line of roughly 23,000 per 32-byte slot, with the jump from 4 to 36 bytes doubled because Solidity stores `bytes` shorter than 32 in a single slot. `createProposalGas` rounds that up generously, which costs nothing because the limit of a plain `ContractExecute` is not charged; falling short costs the whole fee and returns `INSUFFICIENT_GAS`.
- Transaction ids come in two forms: the SDK's `0.0.x@sec.nanos` and Mirror's `0.0.x-sec-nanos` (used in paths). `normalizeTransactionId` accepts both; one id can return several rows (parent plus scheduled/child rows). A signer only returns the transaction id, so the id of a schedule comes from the `SCHEDULECREATE` row of that transaction (`scheduleIdFromTransaction`); the child row's `entity_id` is the contract the scheduled call reached, not the schedule.
- **A schedule can only be withdrawn if it was created with an admin key, and that key has to sign the create.** Without one, `ScheduleDelete` is refused with `SCHEDULE_IS_IMMUTABLE` and the only way out is the expiry; naming a key that does not sign the `ScheduleCreate` fails with `INVALID_SIGNATURE`. Both measured on testnet ([immutable](https://hashscan.io/testnet/transaction/1790341670.244801104), [unsigned admin key](https://hashscan.io/testnet/transaction/1790341662.457864222)). That is why the admin key of a proposal is the proposer's own key and never the governance account's: the council's threshold key in that slot would turn opening a proposal into an m-of-n vote of its own.
- **A schedule that executed is not a schedule that succeeded.** Mirror sets `executed_timestamp` as soon as the network runs the scheduled transaction, and a call that reverts runs too — measured on testnet: [schedule 0.0.10670585](https://hashscan.io/testnet/schedule/0.0.10670585) (an earlier deployment of these contracts), a `TokenAdmin` freeze of an account that never associated the token, reads as executed while its scheduled row says `CONTRACT_REVERT_EXECUTED`. `executed_timestamp` is that row's `consensus_timestamp`, so `GET /api/v1/transactions?timestamp=<executed_timestamp>` returns exactly the scheduled row (`scheduled: true`) and its `result` (`fetchScheduleExecution`; the endpoint answers an empty list, not a 404, until it is indexed). `deriveScheduleState` still says `executed` for both, and `Proposal.execution` says `succeeded` or `failed`. A revert leaves the registry entry as it was, so a pending entry is retried by scheduling `execute(id)` again, not by proposing it again; and since a schedule runs once, nothing live points at the entry any more and Cancel is safe (`cancellableRegistryId`).
- **Withdrawing a proposal has two layers, and they answer different questions.** `ScheduleDelete` ends one round of approval — the registry entry stays pending and anyone can schedule `execute(id)` again. `GovernedExecutor.cancel(id)` ends the proposal for good, and the proposer can call it straight, with no schedule and no quorum. A schedule left alive for a cancelled proposal is a trap: reaching its threshold reverts with `ProposalNotPending` and the governance account pays the gas consumed, so delete the schedule first and cancel afterwards. A native proposal (a council rotation through `AccountUpdate`) has no registry entry, so there the delete is the only retraction.
- **HashPack refuses to sign a `ScheduleDelete`, and the dapp cannot tell.** Verified on testnet on 2026-09-29 with account `0.0.10574825` over the same WalletConnect connector: HashPack (iOS app and desktop extension) shows "Unsupported Transaction Type", with Reject as the only option, through both `hedera_signAndExecuteTransaction` and `hedera_signTransaction`, and the refusal reaches the dapp as a plain `USER_REJECT`, the same as a person pressing Reject. The transaction is valid: Kabila signed it and deleted schedule `0.0.10779411` (`SUCCESS`, Mirror `deleted: true`; `deleted_timestamp` stays null, so read the boolean). The signer's `kind` is "hashpack" for every WalletConnect wallet, Kabila included, so the wallet is named by the session's peer metadata (`walletName` from `useHederaSigner`), and `signsScheduleDelete` (`services/web3/walletCapabilities.ts`) decides whether Withdraw and a delete-first Cancel warn before the prompt. Remove HashPack from `WALLETS_WITHOUT_SCHEDULE_DELETE` once it supports the type.

  | Transaction      | HashPack | Kabila     |
  | ---------------- | -------- | ---------- |
  | `ContractCall`   | signs    | not tested |
  | `ScheduleCreate` | signs    | not tested |
  | `ScheduleSign`   | signs    | not tested |
  | `ScheduleDelete` | refuses  | signs      |

- **Rotating a threshold key needs signatures from both councils, and the schedule waits for them.** Measured on testnet with throwaway accounts: a scheduled `AccountUpdate` that replaces an account's threshold key did **not** run on the outgoing council's threshold alone — the schedule simply stayed pending — and ran as soon as the incoming key's own threshold was also met. Each side needs its **own threshold**, not all of its members: 2-of-3 outgoing plus 2-of-3 incoming was enough ([schedule 0.0.10716509](https://hashscan.io/testnet/schedule/0.0.10716509): pending with the two outgoing signatures, executed on the second incoming one). So a council rotation has two progress counts, and `countThresholdSignatures` against the current council alone would show a bar that can never fill. The incoming council is in the decoded body (`decodeScheduledOperation` returns it as a `CouncilKey`), so the inbox counts both: `Proposal.progress` against the council that exists and `Proposal.incomingProgress` against the one being proposed, null for every other kind.
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

1. **Service function** that builds and freezes the SDK transaction (pure, testable, no React). Return the frozen transaction or the `transactionId`. It belongs in `packages/core` when it is domain — a proposal, a Mirror read, anything the co-signing agent would also need — and in `packages/nextjs/services/` when it needs the app: the wallet, a route handler, `scaffold.config.ts`. **The rule is one-way: `@sh/core` never imports from the app.** That is what keeps it usable outside the browser, and `import scaffoldConfig` inside it is the way it breaks — pass the relay URL and the network name in as parameters, the way every function there already does.
2. **Hook** in `hooks/` wrapping it in `useMutation`; get the signer through `useHederaSigner` and call `requireAccountId()` early so it throws when nothing is connected and works with both HashPack and the test signer.
3. **Read side**: add or reuse a hook under `hooks/mirror/` so the UI refreshes from the Mirror Node after the write; pass the expected sequence number or transaction id so polling knows when to stop.
4. **Tests** next to the code (`*.test.ts`): assert the transaction shape (type, payer, memo, batch key) with the SDK, mock the wallet and Mirror calls, never hit the network. What only the network can settle goes in a `*.integration.test.ts` that skips without credentials (`packages/nextjs/services/governance/schedules.integration.test.ts`); those two stay in the app because they read the fixtures `yarn setup` wrote and sign through the app's signer. In the app, test what decides something — who may sign, withdraw or cancel, what a draft sends, what a screen says is true — and the one screen that renders it; a component that only lays out, words or animates what a tested rule decided gets no test of its own, and its copy is pinned in `.harness/validators/static.json` when it matters.
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
yarn harness:council-seat             # seats the run's test signer on the council; the harness calls it, not you
```

`chainValidation` is enabled in `spec.yaml`: `validate-semantic` and `harness:run` provision a funded testnet account with the operator exported in the shell (`HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`; the harness does not read `.env`) and inject its key as `localStorage["burnerWallet.pk"]`, which the app picks up as the test signer. `validate` and `doctor --recipe-only` ignore it, so CI needs no credentials; the full `doctor` reports the two variables as missing until you export them. Assertions flagged `executableWithTestSigner` (E9) run end to end and are verified on the Mirror Node. Paying for a transaction is not the same as approving one, so the dev server command in `validators/playwright-smoke.yaml` runs `yarn harness:council-seat` before `yarn next:dev`: it rebuilds the governance account's threshold key as the three configured members — plus the co-signing agent when the council has already seated it — plus the run's signer, signed by the two demo members, who meet both the old key's threshold and the new one's. Without that seat a `ScheduleSign` from the test signer is refused with `INVALID_SIGNATURE`. **`chainValidation.deploy.commands` is the obvious home for this and the wrong one:** those commands are reached from `runValidationStages`, which `validate-semantic` never calls — that path goes straight from provisioning the signer to booting the server — so a seat declared there runs under `harness:run` and nowhere else. The server command is the only hook both entry points share. The script finds the signer from `HARNESS_SIGNER_ACCOUNT_ID` or, failing that, from the `chain-signer.json` the harness writes to the workspace root; with neither it prints a line and stops, so `validate` stays credential-free. It reads the demo members' keys from the gitignored `setup-state.json`, so the stage expects a workspace that has already run `yarn setup`.

Keep `.harness/validators/static.json` and `.harness/eval.json` in sync with routes and copy you change. Do not assert on `template.json`: `create-scaffold-hbar` removes it when scaffolding.

## Code style

| Style            | Use for                     |
| ---------------- | --------------------------- |
| `UpperCamelCase` | types, components, enums    |
| `lowerCamelCase` | functions, variables, hooks |
| `CONSTANT_CASE`  | constants                   |

TypeScript strict, no `any`, named exports, early returns, functions with at most three parameters and no boolean flags. Prefer `type` over `interface`. Comments only when they add non-obvious context; no commented-out code.
