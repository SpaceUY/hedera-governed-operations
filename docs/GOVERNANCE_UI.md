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
    governance/GovernanceProvider.tsx  # the resolved config (useGovernanceConfig), the map's decorator (useMapDecorator) and the wizard's provider, for the whole layout
    governance/TreasuryStrip.tsx    # treasury figures and the council's threshold, above the map
    governance/MutationError.tsx
    governance/wizard/              # ProposalWizardProvider + ProposalWizard, OperationTypePicker, CouncilPreviewPanel, copy.ts; kinds/ (one folder per kind + registry.ts)
    governance/graph/               # GovernanceMap (data) → GovernanceGraph (SVG): nodes, GraphEdge, SignatureRing, Legend; copy.ts; useCouncilSeatNames (the map's names for the seats, for the rail)
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
    drafts/                         # form values → encoders, one module per kind; draft.ts reads the preview back through decode.ts
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

The guard asks only for what every screen needs: the ids, the network, `GovernedExecutor` and `AcmeVault`. `AcmeVaultV2`, the implementation a vault upgrade points the proxy at, is looked up by the wizard itself with `findDeployedContract`, which returns null where `getDeployedContract` would throw. Without it the map and the rail render as usual, and the wizard shows the vault upgrade with no form and a notice naming the deploy command, while paying a supplier still works. `TokenAdmin`, which the token form acts through, is looked up the same way (its kind's `resolveTargets`), and missing it has the same effect on that kind.

The network comes from `useTargetNetwork()` through `getHederaNetworkNameFromChainId`, never a literal: a token id from the wrong network's config reads as a balance of 0 rather than an error.

## The live map

`app/(governance)/layout.tsx` renders every governance route, so what sits beside the rail stays mounted while the rail changes route. On a wide screen it is one fold below the header, and the page itself never scrolls:

- **The map pane** (about 60% of the width) never scrolls. From top to bottom: `TreasuryStrip` (HBAR, vault reserve, the governed token under its symbol as the Mirror Node reports it, USDC, the council's threshold), a status line (the map's note on how a proposal ends, `LIVE_MAP_STATUS_NOTE`, until something more specific claims the line), and the map itself (`GovernanceMap`, with the demo layout passed as `decorate`), which fills the rest: its box takes the height left over (`flex-1 min-h-0`) and the SVG scales into it, so the drawing never sets the pane's height.
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
- **Sign** (`canBeSigned`): the schedule is pending, and either it is a native kind with no registry entry, or it is a registry call whose entry was read, is still pending and decodes to one of this template's operations. A missing, cancelled or unrecognised entry gets no button, and neither does an entry the relay could not be asked about.
- **Withdraw** (`canBeWithdrawnBy`): the schedule is pending and the connected account created it. The proposer's key is the schedule's admin key, so a `ScheduleDelete` from anyone else is refused by the network; the button is not shown to them, nor with no wallet connected.
- **Cancel** (`cancellableRegistryId`): offered only once no live schedule points at the entry — the schedule was withdrawn, expired, or ran and failed (a schedule runs once) — and the registry entry is still pending. Withdraw comes first because a live schedule on a cancelled entry can still reach its threshold, revert with `ProposalNotPending` and bill the governance account for the gas.

Wallet rejections are shown as `WALLET_REJECTED_MESSAGE` (`services/web3/hederaSigner.ts`, next to `isWalletRejection`) rather than as a failure.

## What a proposal says

The screen that asks for a signature is the one that has to explain the mechanism, so the domain values never reach it as they are. `proposalLabels.ts` turns them into words:

- the proposal's status (`proposalStatusLabel`): "Collecting signatures", "Executed", "Failed when it ran", "Executed, confirming the result" while Mirror has not served the outcome, "Withdrawn", "Expired";
- for a failed execution (`executionFailureLabel`), the network's response code and what retrying takes: for a registry call whose entry is still pending, scheduling `execute(id)` again for the council to sign — not proposing it again; for a native kind, scheduling the same operation again;
- the registry entry: its state when it was read, "None: the network runs this operation directly" for a native kind, "Not read: the proposal is no longer collecting signatures" for a registry call the inbox left unread because its round is over (`notRead` — the detail page always reads the entry, so there it shows the entry's own state), "No usable entry: do not sign" when the registry has none or the call names another contract, "Could not be read right now" when the relay did not answer;
- approvals as "n of m required signatures", counted against the threshold rather than the council's size (a 2-of-3 council with both signatures in reads "2 of 2 required signatures"), or, for a council rotation, one count for the current council and one for the incoming council, since the schedule waits for both thresholds (see "A rotation collects signatures from two councils" in `docs/ARCHITECTURE.md`);
- the council's rule (`councilRuleLabel`, "2-of-3"), shared by the map, the treasury strip and the wizard;
- the inbox's headings on `/`: "Pending proposals", "Settled" and "No proposal is waiting for signatures." (`INBOX_COPY`), and the map pane's status note (`LIVE_MAP_STATUS_NOTE`).

The wizard's words across kinds — each kind's title and hint, the path chips it travels, the gas and expiry rows, who approves, and the one-or-two-transactions CTA — live in `components/governance/wizard/copy.ts`, a kind's own form words in its folder under `wizard/kinds/`, and the map's — node names and captions, edge captions and the legend — in `components/governance/graph/copy.ts`, so each module holds one screen's words.

A pending proposal also says that it runs as soon as the threshold is reached and that it expires, with nothing run, if the threshold is not reached by its expiration time.

## Opening a proposal

`useCreateProposal` sends two transactions: `createProposal` registers the call in `GovernedExecutor`, then a `ScheduleCreate` wraps `execute(id)` for the council to sign, with the proposer's key as admin key. The registry id only comes back through Mirror (`proposalIdFromContractResult`), so the hook waits for indexing with backoff (`waitForMirrorIndexing`). Once `createProposal` has gone through, a failure of anything after it — Mirror not yet indexing the registration, the wallet rejecting the `ScheduleCreate`, the network refusing it — leaves the entry registered and unscheduled, and the hook keeps it (`unscheduledEntry`, `services/governance/unscheduledEntry.ts`). Submitting the same call again (same executor, target and calldata, `isEntryFor`) reads the entry's id if it was not known yet and only schedules it, so a retry never registers a duplicate; the wizard's button then reads "Schedule entry N with your wallet" and says why. A registration that reverted left no entry and is forgotten; once the `ScheduleCreate` has gone through the entry is forgotten too, since a second schedule on it would revert and bill the treasury once the first one ran. The entry is held in memory only: after a reload a retry registers again, and an entry left unscheduled stays pending until its proposer cancels it. `useCreateNativeProposal` schedules a transfer or a council rotation directly, with no registry entry.

Both hooks take an already-encoded proposal from `@sh/core/governance/encode`, which enforces the chain invariants (positive amounts, a reachable threshold, no duplicate council key) before anything becomes a transaction.

The wizard is two components so that it can live in a page or in a side panel. `ProposalWizardProvider` owns the chosen kind, the current draft, its preview and the submit mutation, and reports the new schedule id through `onSubmitted`; `ProposalWizard` renders the picker, the form, the preview and the submit footer, with no route, title or setup guard of its own. The host renders those, gives the wizard a height (it fills it, scrolls its middle and keeps the footer in view) and the level of its headings. Because the submission lives in the provider, closing a panel while the wallet signs does not lose it, and anything else inside the provider — a map drawing the draft — reads the same preview through `useProposalWizard()`. On the live map the host is split: the governance layout runs the setup guard and mounts the provider (`GovernanceProvider`), whose `onSubmitted` routes to the detail page, and `/governance/new` adds only a title and the way back to the map.

The wizard knows no kind by name. Each kind is a folder under `components/governance/wizard/kinds/` — its form, its copy and a `kind.ts` that pairs the form with `resolveTargets`, which finds the contracts and ids the kind acts on from the resolved config, or returns the notice saying why it cannot be proposed on this network (the contract it acts through is not deployed) — and `kinds/registry.ts` lists them, one line each, in a record keyed by the kinds in `kinds/wizardKinds.ts`. `defineWizardKind` keeps each kind's own targets type inside its entry, so the wizard renders whichever kind is picked with the same call and shows its notice in place of the form. Adding a kind is its folder, a draft module under `services/governance/drafts/` (re-exported from its `index.ts`), and one line in each of those two lists.

The picker is native radio buttons sharing one name across its two groups ("Contract calls · through the registry", "Native · no contract, no registry entry"), so a keyboard moves the choice with the arrow keys. It is disabled while a submission is pending, since picking another kind resets the draft. The wizard says why the button is disabled rather than leaving it greyed out: no wallet connected, a vault upgrade with no `AcmeVaultV2` deployed to point the proxy at, the proposer list still loading or unreadable, an account without `PROPOSER_ROLE` for a contract-backed kind, a recipient or holder that is malformed, still being looked up, or not an account, a holder that never associated the token it would freeze, or a recipient that could not hold the token it would be sent. The words live in `components/governance/wizard/copy.ts`, the wizard's own copy module, and in the copy of the kind that raises them.

`/governance/new` builds a draft from the form through `services/governance/drafts/`, whose module for the kind converts amounts without rounding and calls the encoders, and previews it through `decodeScheduledOperation` / `decodeRegistryOperation`: what the proposer reviews is what the detail page will show the council. A body the decoder cannot fully read cannot be submitted. The vault upgrade always runs `initV2(limit)` in the approved call, since `initV2` is a reinitializer anyone could call afterwards. Under its implementation address the upgrade form says whether a published release vouches for it, read the way the co-signing agent reads it (`checkImplementationAgainstManifest` in `@sh/core`, through `useReleaseCheck`): the release whose code hash matches the deployed code, no release naming the address, a release naming it whose hash no longer matches, or a topic that could not be read — with a HashScan link to the topic. It is information only and never holds the draft back; the agent is what refuses. The line is hidden when `NEXT_PUBLIC_RELEASE_TOPIC_ID` is not set (`getReleaseTopicId`). `decodeRegistryOperation` reads the limit back out of that call, so the preview and the detail page both name it; an upgrade that runs any other initializer decodes as unrecognised and is offered no Sign. The schedule's memo is the kind's title.

The token form acts on the token whose pause and freeze keys `TokenAdmin` holds (`NEXT_PUBLIC_DEMO_TOKEN_ID`), shown read-only with whether it is paused right now (`useToken`). A freeze or an unfreeze names one holder, typed as an id or an EVM address and resolved through the Mirror Node like a transfer's recipient (`accountLookup`); the form then reads the holder's relationship with the token (`useTokenRelationship`). An empty answer is not a failed read but an account that never associated the token, which the network would refuse to freeze (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`) after the governance account paid for the call, so the form says so and offers no draft. The draft names the token and the holder by their long-zero addresses (`longZeroAddress`), which the token system contract resolves like any other form of the same account.

The transfer form pays out HBAR or one of the tokens the treasury holds — the setup's token and the DEX configuration's USDC — as a native `CryptoTransfer`. A token amount is converted with the token's decimals from `useToken` (`parseTokenDecimals`), never assumed, and refused rather than rounded when it is finer than they allow. Before drafting a token payment the form reads the recipient's relationship with the token: an account that never associated it and has no automatic association slots (`max_automatic_token_associations` of 0) would make the network refuse the transfer once the council approved it, so the form says so and offers no draft; one with slots is told the transfer associates it, provided a slot is still free when the threshold is reached.

The wizard's one council rotation seats the co-signing agent. Its form asks for one account, the agent's, and reads it through `useAccount`: the draft keeps every current member in the council's order (each seat read back into a key with `memberPublicKey`), adds the agent's key last and leaves the threshold as it is, so a 2-of-3 council becomes 2-of-4 — `draftCouncilRotation` with those members, no encoder of its own. The account is refused, with the reason, when it is not an account, holds no single key (`singlePublicKey`), holds a key other than ECDSA (the agent in `packages/agent` signs with an ECDSA key), or already holds a seat (`memberKeyOfAccount` against the council's keys) — the demo's agent runs on Bob's seat, so entering Bob says he is a member already. The form names the council it would make with the map's names for the seats (`useCouncilSeatNames`: the demo decorator the layout hands `GovernanceProvider`, the account ids without it, "your wallet" for the connected account's seat), states that it takes two thresholds — the current council's and the proposed one's own, the schedule waiting until both are met (see "A rotation collects signatures from two councils" in `docs/ARCHITECTURE.md`) — and that the co-signing agent never signs a rotation, so both have to come from human members. Every number is the ledger's, and so is the picker's hint (`→ 2-of-4 council`, from the kind's `hint`). The configuration names no agent account yet, so the field starts empty; `suggestedAgentAccountId` in the kind's targets is where one would go. The preview's "Function" row reads the proposed rule off the decoded key, and "Who approves" names both councils, the proposed one as the decoder read it back. A general editor for adding and removing members is not part of the wizard.

## The governance map

`components/governance/graph/` draws the graph `services/governance/graph.ts` derives. `GovernanceMap` takes the `GovernanceConfig` the host's setup guard resolved, reads the council and the inbox through `useProposals` (so it adds no polling of its own), builds the configured entities with `governanceEntitiesOf` — the vault, `TokenAdmin` and the swap adapter as targets, the token, the SaucerSwap router as an external contract the adapter has exactly one authority link to, and where the money is (router → treasury, the vault's reserve) — and hands the result to `GovernanceGraph`, which only draws.

- **Shapes.** An account is a circle (`AccountNode`), a contract a rounded rectangle (`ContractNode`, dashed when it is outside the system), a token a hexagon (`TokenNode`), and the governance account the one large node (`TreasuryNode`), with the council's rule written inside ("2-of-3") and the approvals of the proposal being shown as a separate `SignatureRing`.
- **Edges.** One `GraphEdge` for every phase — `rest`, `preview`, `progress`, `complete`, `failed` — set by whoever draws the map; at rest authority is a solid grey line and money a dotted one, and an `intent` edge (what a pending proposal would use) is drawn only while that proposal is shown. The `Legend` stays on the canvas. An edge that does not end at the treasury — every `PROPOSER_ROLE` arc from a proposer to the registry — goes around it (`routeOnMap` in `geometry.ts`), on whichever side its straight line passes, so registering never looks like it runs through the council; this holds for any layout, the fallback included.
- **Ids.** Graph ids contain `+/=:.->`, so nothing puts them in a DOM `id` or a selector: an item carries `data-node-id` / `data-edge-id`.
- **Keyboard.** The map is one Tab stop with a roving tabindex: the arrow keys (and Home / End) move through the nodes in reading order, then the edges, and a focus ring shows where. An item is a `button` when the host passes `onActivate`, a `graphics-symbol` otherwise. Every item has an accessible name, and every name is real SVG text.
- **Layout.** Without a decoration every node is placed by role (`autoLayout`) and named by role, by the proposer account holding a seat, or by its id. The seat the connected account holds (`useHederaSigner().accountId`) is named "You" over any other name; the account is matched to a seat through the proposer list, the only accounts whose keys the map reads, so with no wallet, or one that is not a proposer, no seat is. `decorate` is where a demo places and names the nodes; the colours are daisyUI tokens plus `--color-map-preview` in `styles/globals.css`, so both themes work.
- **Removing the demo layout**: delete `components/governance/graph/demo/`, then, in `app/(governance)/layout.tsx` — the only file that imports it — remove the `decorateDemoMap` import, the `decorate={decorateDemoMap}` prop and the `mapDecorator={decorateDemoMap}` one on `GovernanceProvider`. The map falls back to `autoLayout`, and the wizard names the council's seats by their account ids.

## Not built yet

- **Approvals render as text.** `Proposal.progress` and `Proposal.incomingProgress` carry everything a progress visual needs, including which members signed (`signedBy`).
- **A registry entry that was never scheduled** — the seed proposal `yarn setup` registers is one — has no detail page, since there is no schedule id to route on.
