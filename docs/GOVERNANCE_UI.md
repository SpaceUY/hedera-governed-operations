# Governance UI

How the Governed Operations screens are put together: the routes, the layers under them, where each rule lives, and what the screens deliberately do not do yet. The on-chain side — `GovernedExecutor`, `AcmeVault`/`AcmeVaultV2`, `TokenAdmin`, `SaucerSwapAdapter` and the proposal model — is described in `docs/ARCHITECTURE.md`; this document starts where a screen reads from it.

## Routes

| Route                      | What it shows                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | The live map: in the rail, the proposals still collecting signatures under "Pending proposals" and the settled ones below, each with its status and approvals                |
| `/governance/[scheduleId]` | One proposal: what it does, the schedule's status, the registry entry behind it, the gas and HBAR the treasury pays, approvals, and Sign / Withdraw / Cancel when they apply |
| `/governance/new`          | Opening a proposal: the operation picker, its form, what the council will see, and the wallet transactions that register and/or schedule it                                  |
| `/proof-wall`              | The Proof Wall demo, moved off the root; it links My Proofs, Admin and Explorer, which the header no longer lists                                                            |

The three governance routes share one layout, described under "The live map" below; the treasury figures and the council's threshold sit in its map pane, above every one of them. The header's navigation is Live map (`/`, lit on every `/governance/…` route too) and Proof wall. A Settings item joins it when there is a settings page to open.

The detail route is keyed by **schedule id**, since a proposal is a schedule the governance account pays for. A registry entry that was registered but never scheduled has no schedule id, and so no page.

## Layout

```
packages/nextjs/
  app/
    (governance)/                   # route group: shares the live map layout, adds nothing to the URL
      layout.tsx                    # setup guard, GovernanceProvider, map pane (treasury, status line, map) + rail
      page.tsx                      # / — the rail's pending and settled proposals
      governance/[scheduleId]/page.tsx  # proposal detail, in the rail
      governance/new/page.tsx       # opening a proposal, in the rail
    (site)/                         # route group: the pages with a footer
      layout.tsx
      proof-wall/page.tsx           # links my-proofs, admin, explorer
  components/
    SetupNotice.tsx                 # rendered in place of the live map until setup and the deploy have run
    MirrorPollStatus.tsx            # the header's "Mirror Node · polled Xs ago"
    governance/GovernanceProvider.tsx  # the resolved config (useGovernanceConfig) and the wizard's provider, for the whole layout
    governance/TreasuryStrip.tsx    # treasury figures and the council's threshold, above the map
    governance/MutationError.tsx
    governance/wizard/              # ProposalWizardProvider + ProposalWizard, OperationTypePicker, forms/, CouncilPreviewPanel, copy.ts
    governance/graph/               # GovernanceMap (data) → GovernanceGraph (SVG): nodes, GraphEdge, SignatureRing, Legend; copy.ts
    governance/rail/                # ProposalDetailPanel, ApproverList + CouncilMemberRow, WithdrawCancelActions
    governance/graph/demo/          # demo only: the hand-composed layout, names, co-signing agent ghost, inspector copy
  config/governanceConfig.ts        # ids `yarn setup` writes; deployed contract lookup; resolveGovernanceConfig
  hooks/mirror/                     # reads (React Query)
    useCouncil.ts                   # threshold key, members, proposers
    useProposals.ts                 # the inbox
    useProposalLookup.ts            # one proposal by schedule id
    useTreasuryFigures.ts
    useInboxUpdatedAt.ts            # when any inbox on the network was last read, from the query cache
    useMapSnapshot.ts               # the three reads as one snapshot, and the events since the previous one
  hooks/                            # writes (useMutation), flat like useSubmitProof.ts
    useCreateProposal.ts            # contract-backed kinds: createProposal, then ScheduleCreate(execute)
    useCreateNativeProposal.ts      # native kinds: ScheduleCreate(transfer / AccountUpdate)
    useSignProposal.ts              # ScheduleSign
    useWithdrawProposal.ts          # ScheduleDelete
    useCancelProposal.ts            # GovernedExecutor.cancel
    useSubmitProposalDraft.ts       # one submit for the wizard, whichever path the draft takes
  services/governance/
    proposalRoutes.ts               # the path each kind takes, in roles
    graph.ts                        # the governance graph: nodes, edges, a proposal's scope, fallback layout
    graphEntities.ts                # the configured contracts, token and DEX router the graph starts from
    mapEvents.ts                    # GovernanceSnapshot, diffSnapshots: what changed between two reads
    drafts.ts                       # form values → encoders, and the preview read back through decode.ts
    treasury.ts                     # balances plus the vault's reserve
    proposalActions.ts              # which actions a proposal offers, and to whom
    proposalLabels.ts               # the words a screen uses for a proposal's state
packages/core/src/governance/       # @sh/core, shared with the co-signing agent
  council.ts                        # threshold key decoding, approval counting, proposer list
  proposals.ts                      # the inbox: schedules by proposer, narrowed and crossed with the registry
  proposalTypes.ts                  # the five kinds, their execute gas, decoded shapes
  decode.ts / encode.ts             # scheduled body and registry calldata ↔ described operation
  registry.ts                       # entry reads, cancel, the id createProposal returned
  schedules.ts                      # ScheduleCreate / Sign / Delete builders
  scheduledBody.ts                  # the body a schedule carries, from its transaction
```

Every operation follows the services → hooks → page layering described in "How to add an operation" in `AGENTS.md`: the service builds and freezes the transaction, the hook wraps it in `useMutation` and calls `requireAccountId()` first, and the page only calls the hook.

## Before setup

A freshly scaffolded app has no `.env.local` and no deployment, and the governance pages have to render anyway. The governance layout resolves the configuration once for all three routes — `resolveGovernanceConfig(chainId)`, which gathers `getGovernanceEntityIds()`, the network and every `getDeployedContract(chainId, name)` a governance screen reads — and renders `SetupNotice` with the error's message, in place of both panes, if it throws. A page inside the layout reads the result with `useGovernanceConfig()` and has no guard of its own. Each of those throws a message naming the command to run. `getDeployedContract` also throws for an entry without a `hederaContractId`, and returns the id typed as a `string`, so a half-written deployment falls into the same notice rather than travelling on as `undefined`.

The guard asks only for what every screen needs: the ids, the network, `GovernedExecutor` and `AcmeVault`. `AcmeVaultV2`, the implementation a vault upgrade points the proxy at, is looked up by the wizard itself with `findDeployedContract`, which returns null where `getDeployedContract` would throw. Without it the map and the rail render as usual, and the wizard shows the vault upgrade with no form and a notice naming the deploy command, while paying a supplier still works.

The network comes from `useTargetNetwork()` through `getHederaNetworkNameFromChainId`, never a literal: a token id from the wrong network's config reads as a balance of 0 rather than an error.

## The live map

`app/(governance)/layout.tsx` renders every governance route, so what sits beside the rail stays mounted while the rail changes route. On a wide screen it is one fold below the header, and the page itself never scrolls:

- **The map pane** (about 60% of the width) never scrolls. From top to bottom: `TreasuryStrip` (HBAR, vault reserve, ACME, USDC, the council's threshold), a status line (the map's note on how a proposal ends, `LIVE_MAP_STATUS_NOTE`, until something more specific claims the line), and the map itself (`GovernanceMap`, with the demo layout passed as `decorate`), which fills the rest: its box takes the height left over (`flex-1 min-h-0`) and the SVG scales into it, so the drawing never sets the pane's height.
- **The rail** (40%) scrolls on its own and renders the route's page: the proposal list on `/`, the detail on `/governance/[scheduleId]`, the wizard on `/governance/new`. A page is written as panel content — no page-level width or centring, an `h1` at panel size — and the wizard fills the rail's height, scrolling its middle with its submit button in view.
- **Shared state** comes from `GovernanceProvider`, mounted once by the layout: the resolved configuration, through `useGovernanceConfig()`, and `ProposalWizardProvider`, so the draft being written in the rail is readable beside it and a submission survives the rail changing route. Once submitted, it routes to the new proposal's page and clears the draft, so the next proposal starts empty. A layout cannot hand props to its page, which is why both are contexts.
- **On a phone** the map pane and the rail stack, and the page scrolls; nothing scrolls sideways.

The list on `/` splits the inbox with `partitionProposals` (`services/governance/proposals.ts`), from the schedule's state alone: an open approval round is pending, and an executed, withdrawn or expired one is settled whatever its outcome.

The header shows how fresh the list is: "Mirror Node · polled Xs ago", from the `dataUpdatedAt` of the inbox query. `useInboxUpdatedAt` reads it from the query cache rather than from `useProposals`, so the header needs no council ids, and `MirrorPollStatus` ticks once a second without re-rendering anything above it. It stays hidden until an inbox has been read in this session.

## Reads and state

Server state lives in React Query and nowhere else. Components never write proposal or signature state themselves; they render what the last read returned.

- **Polling** follows `hooks/mirror/mirrorQuery.ts`: queries poll every 5 s while something is pending and slow down or stop once settled. A schedule that executed is only settled once Mirror has served its outcome (`hasFinalOutcome`), since the row that says whether it succeeded can lag the schedule. The council is cached, since only an executed proposal changes it.
- **After opening a proposal**, `useCreateProposal` and `useCreateNativeProposal` invalidate every inbox on the network in their own `onSuccess`, not in the caller's, so the list refreshes even when the screen that submitted has gone, instead of waiting out the 30 s poll of a settled inbox.
- **When a proposal settles** (leaves pending: executed, withdrawn or expired), `useProposals` and `useProposalLookup` invalidate the treasury figures, the council as well for a council rotation, and the registry entry behind a registry call (read while it was pending, it would otherwise go on saying Pending next to Executed), together, so the screen does not wait out their cache and shows one consistent world. The work is `useRefreshOnSettle`: it compares each read with the previous one, so the first read only seeds it, and like `refresh()` below it reads once now and once more a poll interval later.
- **Executed is not succeeded.** Mirror marks a schedule executed whether its transaction succeeded or reverted, so `Proposal.execution` reads the scheduled transaction's own row (`fetchScheduleExecution`): `succeeded`, `failed` with the network's response code, `unconfirmed` until Mirror has it, or `notRun`. The inbox reuses an outcome it already resolved instead of reading it on every poll, and reads the registry entry behind a failed execution, since the revert left it as it was; the entry of any other settled registry call is left unread (`notRead`) to spare a relay read per row and poll. `useProposalLookup` reads one entry for one page, so it reads it whatever the schedule's state.
- **The map animates reads, not clicks.** `useMapSnapshot` composes the inbox, the council and the treasury figures — the same queries, so it polls nothing of its own — into one `GovernanceSnapshot`, and `diffSnapshots` (`services/governance/mapEvents.ts`) turns two consecutive snapshots into events: `proposed`, `approved` per member (both councils for a rotation), `executed` / `reverted` once `Proposal.execution` has the outcome (never on `executed_timestamp` alone, so a success is never taken back), and `councilChanged`, a threshold change included. The first snapshot only seeds; a proposal that leaves the inbox window, or reappears because its proposer can be read again, produces nothing; and an event whose consensus timestamp is more than `EVENT_FRESHNESS_MS` (a minute) older than the read is dropped, so a tab that was hidden shows the end state instead of replaying it. A signature from another device is an event like any other. Events are deduped by `animationEventKey` (`kind:scheduleId:memberKey`), since an effect can see them twice under `StrictMode`.
- **After a write**, `useProposalLookup().refresh()` invalidates the schedule and the registry entry immediately and again a poll interval later, because Mirror and the JSON-RPC relay both lag consensus by seconds. The delayed read is cleared if the page unmounts first.
- **The inbox can be partial.** `unreachableProposers` names proposers whose schedules could not be read (Mirror failed, or the address resolves to no account); the home page says the list may be incomplete whenever it is non-empty.
- **A proposal outside the inbox** — older than `PROPOSALS_PER_PROPOSER`, or a native proposal opened by an account without `PROPOSER_ROLE` — is read directly by `useProposalLookup`, which returns the same `Proposal` shape and refuses a schedule the governance account does not pay for, so a crafted link never reaches a Sign button.
- **Relay reads** go through `createRelayClient` (`services/web3/relayClient.ts`), with one retry: the polling already asks again.
- **Amounts from a contract stay `bigint`** until they are rendered, e.g. `formatTinybars(reserve)` (`utils/scaffold-hbar/hbarAmount.ts`).

## What a proposal offers

The rules live in `services/governance/proposalActions.ts` and are tested there; the page only calls them.

- **Open** (`canOpenProposal`): any connected account for a native kind; a contract-backed kind only for a `PROPOSER_ROLE` holder, since `createProposal` reverts for anyone else after charging the fee.
- **Sign** (`canBeSigned`): the schedule is pending, and either it is a native kind with no registry entry, or it is a registry call whose entry was read, is still pending and decodes to one of this template's operations, or one the relay simply could not be asked about (`unreachable`) — the button is still offered there, next to a warning (`UNREACHABLE_REGISTRY_SIGN_WARNING`) that the check could not be made, since the network is the final word either way. A missing or cancelled entry, or one this template does not recognise, still gets no button.
- **Withdraw** (`canBeWithdrawnBy`): the schedule is pending and the connected account created it. The proposer's key is the schedule's admin key, so a `ScheduleDelete` from anyone else is refused by the network; the button is not shown to them, nor with no wallet connected.
- **Cancel** (`cancellableRegistryId`, plus `canCancelRegistryEntry`): `cancellableRegistryId` decides when Cancel is offered at all — only once no live schedule points at the entry any more (withdrawn, expired, or ran and failed — a schedule runs once) and the registry entry is still pending. Withdraw comes first because a live schedule on a cancelled entry can still reach its threshold, revert with `ProposalNotPending` and bill the governance account for the gas. Anyone can open another schedule of `execute(id)` for the same entry, so withdrawing the viewed one is not always enough: `otherOpenScheduleOf` looks through the inbox (the query the map already polls) for another pending schedule of the same entry, and while one exists Cancel is replaced by a note linking to it. That check only sees what the inbox lists — a schedule opened by an account outside the proposer list is not there. `canCancelRegistryEntry` decides *who* may press it: `GovernedExecutor.cancel` is open to the entry's own `proposer` and to any `EXECUTOR_ROLE` holder — in this template, only ever the governance account — read from `RegistryEntry.proposer`, the contract's own ground truth, and never inferred from the schedule's creator (the two coincide in this app's own flow, but nothing guarantees that in general). Addresses are compared case-insensitively against Mirror's `evm_address` for the connected account and for the governance account (`useAccount`, read only once Cancel is otherwise possible). Someone the contract would refuse sees the reason instead of a disabled button (`CANCEL_UNAUTHORIZED_NOTE`), and a confirmed Cancel is a two-step inline control (`WithdrawCancelActions`) rather than a native `confirm()`, matching how the rest of this app avoids native dialogs.

Wallet rejections are shown as `WALLET_REJECTED_MESSAGE` (`services/web3/hederaSigner.ts`, next to `isWalletRejection`) rather than as a failure.

### The proposal detail rail

`components/governance/rail/ProposalDetailPanel.tsx` is the presentational body of `/governance/[scheduleId]`; the route stays a thin owner of the reads (`useProposalLookup`, `useHederaSigner`) and hands the resolved `Proposal` to the panel, so a future host — a rail selection on `/` — can mount the same component from its own read. The panel itself reads `useCouncil` (sharing the cache `useProposalLookup` already populated with the same arguments) to label approvers, and owns the Sign mutation; `WithdrawCancelActions` owns Withdraw and Cancel.

- **`ApproverList` / `CouncilMemberRow`**: one row per council seat, named by the proposer account that holds it, "You" for the connected account's own seat, or the start of the key when nobody proposes it (`memberLabel`, mirroring how the map names a node), each marked signed or not from `ThresholdProgress.signedBy`. Shown alongside the existing aggregate `approvalsLabel` text rather than replacing it. A council rotation renders two lists — "Current council" against `proposal.progress` and "Incoming council" against `proposal.incomingProgress` and the operation's own `council` — since the schedule waits for both thresholds.
- **Relay lag on Cancel**: the JSON-RPC relay reads a block or two behind, and a signer returns once the transaction is submitted — HashPack without a receipt — so neither an immediate re-read nor the submission settles it. `useProposalLookup` exposes `markRegistryEntryCancelled()`, called from `WithdrawCancelActions`'s `onSuccess` instead of `refresh()`: the entry reads "cancelled" straight away, and the registry query polls until the relay agrees. A "pending" answer inside `CANCEL_CONFIRMATION_WINDOW_MS` is taken for lag and does not flash the entry back (which would offer Cancel again, a second transaction that reverts); still "pending" after it, the cancel did not take and the entry reads pending again.
- **Cancel or let it lapse**: a registry entry has no expiry of its own; only its schedule has. An entry left alone after its schedule was withdrawn or expired stays pending and nothing runs, but anyone can schedule it again for the council to approve. Cancel is what ends it for good; the panel says so beside the button (`CANCEL_VS_EXPIRE_NOTE`).
- **The inbox's "Cancelled" gap**: `fetchProposalInbox` (`packages/core/src/governance/proposals.ts`) only reads a registry entry for a proposal whose round is still open or that ran and failed (`isRoundOpen`); a withdrawn or expired schedule is left `notRead` to spare a read per row and poll. So a proposal withdrawn and *then* cancelled can read as "Withdrawn" in a list built the inbox's way, with no "Cancelled" anywhere, even though the entry itself has moved on. The detail panel does not have this gap — `useProposalLookup` always reads the entry, whatever the schedule's state — but a future rail list built on `useProposals`/`fetchProposalInbox` would inherit it, and fixing that is out of this component's scope: it belongs to whoever builds that list.

## What a proposal says

The screen that asks for a signature is the one that has to explain the mechanism, so the domain values never reach it as they are. `proposalLabels.ts` turns them into words:

- the proposal's status (`proposalStatusLabel`): "Collecting signatures", "Executed", "Failed when it ran", "Executed, confirming the result" while Mirror has not served the outcome, "Withdrawn", "Expired";
- for a failed execution (`executionFailureLabel`), the network's response code and what retrying takes: for a registry call whose entry is still pending, scheduling `execute(id)` again for the council to sign — not proposing it again; for a native kind, scheduling the same operation again;
- the registry entry: its state when it was read, "None: the network runs this operation directly" for a native kind, "Not read: the proposal is no longer collecting signatures" for a registry call the inbox left unread because its round is over (`notRead` — the detail page always reads the entry, so there it shows the entry's own state), "No usable entry: do not sign" when the registry has none or the call names another contract, "Could not be read right now" when the relay did not answer;
- approvals as "n of m required signatures", counted against the threshold rather than the council's size (a 2-of-3 council with both signatures in reads "2 of 2 required signatures"), or, for a council rotation, one count for the current council and one for the incoming council, since the schedule waits for both thresholds (see "A rotation collects signatures from two councils" in `docs/ARCHITECTURE.md`);
- the council's rule (`councilRuleLabel`, "2-of-3"), shared by the map, the treasury strip and the wizard;
- the inbox's headings on `/`: "Pending proposals", "Settled" and "No proposal is waiting for signatures." (`INBOX_COPY`), and the map pane's status note (`LIVE_MAP_STATUS_NOTE`).

The wizard's words — each kind's title and hint, the path chips it travels, the gas and expiry rows, who approves, and the one-or-two-transactions CTA — live in `components/governance/wizard/copy.ts`, and the map's — node names and captions, edge captions and the legend — in `components/governance/graph/copy.ts`, so each module holds one screen's words.

A pending proposal also says that it runs as soon as the threshold is reached and that it expires, with nothing run, if the threshold is not reached by its expiration time.

## Opening a proposal

`useCreateProposal` sends two transactions: `createProposal` registers the call in `GovernedExecutor`, then a `ScheduleCreate` wraps `execute(id)` for the council to sign, with the proposer's key as admin key. The registry id only comes back through Mirror (`proposalIdFromContractResult`), so the hook waits for indexing with backoff (`waitForMirrorIndexing`). If Mirror still has not indexed the registration, the hook fails with a message saying the entry is registered and must be scheduled, not registered again. `useCreateNativeProposal` schedules a transfer or a council rotation directly, with no registry entry.

Both hooks take an already-encoded proposal from `@sh/core/governance/encode`, which enforces the chain invariants (positive amounts, a reachable threshold, no duplicate council key) before anything becomes a transaction.

The wizard is two components so that it can live in a page or in a side panel. `ProposalWizardProvider` owns the chosen kind, the current draft, its preview and the submit mutation, and reports the new schedule id through `onSubmitted`; `ProposalWizard` renders the picker, the form, the preview and the submit footer, with no route, title or setup guard of its own. The host renders those, gives the wizard a height (it fills it, scrolls its middle and keeps the footer in view) and the level of its headings. Because the submission lives in the provider, closing a panel while the wallet signs does not lose it, and anything else inside the provider — a map drawing the draft — reads the same preview through `useProposalWizard()`. On the live map the host is split: the governance layout runs the setup guard and mounts the provider (`GovernanceProvider`), whose `onSubmitted` routes to the detail page, and `/governance/new` adds only a title and the way back to the map.

The picker is native radio buttons sharing one name across its two groups ("Contract calls · through the registry", "Native · no contract, no registry entry"), so a keyboard moves the choice with the arrow keys. It is disabled while a submission is pending, since picking another kind resets the draft. The wizard says why the button is disabled rather than leaving it greyed out: no wallet connected, a vault upgrade with no `AcmeVaultV2` deployed to point the proxy at, the proposer list still loading or unreadable, an account without `PROPOSER_ROLE` for a contract-backed kind, or a recipient that is malformed, still being looked up, or not an account. The words live in `components/governance/wizard/copy.ts`, the wizard's own copy module.

`/governance/new` builds a draft from the form through `services/governance/drafts.ts`, which converts amounts without rounding and calls the encoders, and previews it through `decodeScheduledOperation` / `decodeRegistryOperation`: what the proposer reviews is what the detail page will show the council. A body the decoder cannot fully read cannot be submitted. The vault upgrade always runs `initV2(limit)` in the approved call, since `initV2` is a reinitializer anyone could call afterwards. `decodeRegistryOperation` reads the limit back out of that call, so the preview and the detail page both name it; an upgrade that runs any other initializer decodes as unrecognised and is offered no Sign. The schedule's memo is the kind's title.

## The governance map

`components/governance/graph/` draws the graph `services/governance/graph.ts` derives. `GovernanceMap` takes the `GovernanceConfig` the host's setup guard resolved, reads the council and the inbox through `useProposals` (so it adds no polling of its own), builds the configured entities with `governanceEntitiesOf` — the vault, `TokenAdmin` and the swap adapter as targets, the token, the SaucerSwap router as an external contract the adapter has exactly one authority link to, and where the money is (router → treasury, the vault's reserve) — and hands the result to `GovernanceGraph`, which only draws.

- **Shapes.** An account is a circle (`AccountNode`), a contract a rounded rectangle (`ContractNode`, dashed when it is outside the system), a token a hexagon (`TokenNode`), and the governance account the one large node (`TreasuryNode`), with the council's rule written inside ("2-of-3") and the approvals of the proposal being shown as a separate `SignatureRing`.
- **Edges.** One `GraphEdge` for every phase — `rest`, `preview`, `progress`, `complete`, `failed` — set by whoever draws the map; at rest authority is a solid grey line and money a dotted one, and an `intent` edge (what a pending proposal would use) is drawn only while that proposal is shown, gated by `canShowIntent` rather than `canBeSigned`: a registry call the relay could not read offers Sign but draws no intent, since the app cannot say what the entry currently holds. The `Legend` stays on the canvas. An edge that does not end at the treasury — every `PROPOSER_ROLE` arc from a proposer to the registry — goes around it (`routeOnMap` in `geometry.ts`), on whichever side its straight line passes, so registering never looks like it runs through the council; this holds for any layout, the fallback included.
- **Ids.** Graph ids contain `+/=:.->`, so nothing puts them in a DOM `id` or a selector: an item carries `data-node-id` / `data-edge-id`.
- **Keyboard.** The map is one Tab stop with a roving tabindex: the arrow keys (and Home / End) move through the nodes in reading order, then the edges, and a focus ring shows where. An item is a `button` when the host passes `onActivate`, a `graphics-symbol` otherwise. Every item has an accessible name, and every name is real SVG text.
- **Layout.** Without a decoration every node is placed by role (`autoLayout`) and named by role, by the proposer account holding a seat, or by its id. The seat the connected account holds (`useHederaSigner().accountId`) is named "You" over any other name; the account is matched to a seat through the proposer list, the only accounts whose keys the map reads, so with no wallet, or one that is not a proposer, no seat is. `decorate` is where a demo places and names the nodes; the colours are daisyUI tokens plus `--color-map-preview` in `styles/globals.css`, so both themes work.
- **Removing the demo layout**: delete `components/governance/graph/demo/`, then, in `app/(governance)/layout.tsx` — the only file that imports it — remove the `decorateDemoMap` import and the `decorate={decorateDemoMap}` prop. The map falls back to `autoLayout`.

## Not built yet

- **Three kinds have no form yet**: the treasury swap, token administration and council rotation are encoded and decoded, but the wizard lists only the vault upgrade and the supplier payment.
- **A registry entry that was never scheduled** — the seed proposal `yarn setup` registers is one — has no detail page, since there is no schedule id to route on.
- **A rail-hosted proposal list** (a selection on `/` reusing `ProposalDetailPanel`) still has to be built; see "The inbox's 'Cancelled' gap" above for the one thing it will need beyond what the detail route already does.
