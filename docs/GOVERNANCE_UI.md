# Governance UI

How the Governed Operations screens are put together: the routes, the layers under them, where each rule lives, and what the screens deliberately do not do yet. The on-chain side — `GovernedExecutor`, `AcmeVault`/`AcmeVaultV2`, `TokenAdmin`, `SaucerSwapAdapter` and the proposal model — is described in `docs/ARCHITECTURE.md`; this document starts where a screen reads from it.

## Routes

| Route                      | What it shows                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Treasury figures (HBAR, vault reserve, ACME, USDC), the council's threshold, and the council's proposals with their status and approvals                                 |
| `/governance/[scheduleId]` | One proposal: what it does, the schedule's status, the registry entry behind it, the gas and HBAR the treasury pays, approvals, and Sign / Withdraw / Cancel when they apply |
| `/governance/new`          | Opening a proposal: the operation picker, its form, what the council will see, and the wallet transactions that register and/or schedule it                              |
| `/proof-wall`              | The Proof Wall demo, moved off the root                                                                                                                                   |

The detail route is keyed by **schedule id**, since a proposal is a schedule the governance account pays for. A registry entry that was registered but never scheduled has no schedule id, and so no page.

## Layout

```
packages/nextjs/
  app/
    page.tsx                        # governance home
    governance/[scheduleId]/page.tsx  # proposal detail
    governance/new/page.tsx         # opening a proposal
    proof-wall/page.tsx
  components/
    SetupNotice.tsx                 # rendered in place of a governance page until setup and the deploy have run
    governance/MutationError.tsx
    governance/wizard/              # ProposalWizardProvider + ProposalWizard, OperationTypePicker, forms/, CouncilPreviewPanel
  config/governanceConfig.ts        # ids `yarn setup` writes; deployed contract lookup; resolveGovernanceConfig
  hooks/mirror/                     # reads (React Query)
    useCouncil.ts                   # threshold key, members, proposers
    useProposals.ts                 # the inbox
    useProposalLookup.ts            # one proposal by schedule id
    useTreasuryFigures.ts
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

A freshly scaffolded app has no `.env.local` and no deployment, and the governance pages have to render anyway. Each page resolves its configuration first — `resolveGovernanceConfig(chainId)`, which gathers `getGovernanceEntityIds()`, the network and every `getDeployedContract(chainId, name)` a governance screen reads — and renders `SetupNotice` with the error's message if it throws. Each of those throws a message naming the command to run. `getDeployedContract` also throws for an entry without a `hederaContractId`, and returns the id typed as a `string`, so a half-written deployment falls into the same notice rather than travelling on as `undefined`.

The guard asks only for what every screen needs: the ids, the network, `GovernedExecutor` and `AcmeVault`. `AcmeVaultV2`, the implementation a vault upgrade points the proxy at, is looked up by the wizard itself with `findDeployedContract`, which returns null where `getDeployedContract` would throw. Without it the home and the detail pages render as usual, and the wizard shows the vault upgrade with no form and a notice naming the deploy command, while paying a supplier still works.

The network comes from `useTargetNetwork()` through `getHederaNetworkNameFromChainId`, never a literal: a token id from the wrong network's config reads as a balance of 0 rather than an error.

## Reads and state

Server state lives in React Query and nowhere else. Components never write proposal or signature state themselves; they render what the last read returned.

- **Polling** follows `hooks/mirror/mirrorQuery.ts`: queries poll every 5 s while something is pending and slow down or stop once settled. A schedule that executed is only settled once Mirror has served its outcome (`hasFinalOutcome`), since the row that says whether it succeeded can lag the schedule. The council is cached, since only an executed proposal changes it.
- **After opening a proposal**, `useCreateProposal` and `useCreateNativeProposal` invalidate every inbox on the network in their own `onSuccess`, not in the caller's, so the list refreshes even when the screen that submitted has gone, instead of waiting out the 30 s poll of a settled inbox.
- **When a proposal settles** (leaves pending: executed, withdrawn or expired), `useProposals` and `useProposalLookup` invalidate the treasury figures, and the council as well for a council rotation, together, so the screen does not wait out their cache and shows one consistent world. The work is `useRefreshOnSettle`: it compares each read with the previous one, so the first read only seeds it, and like `refresh()` below it reads once now and once more a poll interval later.
- **Executed is not succeeded.** Mirror marks a schedule executed whether its transaction succeeded or reverted, so `Proposal.execution` reads the scheduled transaction's own row (`fetchScheduleExecution`): `succeeded`, `failed` with the network's response code, `unconfirmed` until Mirror has it, or `notRun`. The inbox reuses an outcome it already resolved instead of reading it on every poll, and reads the registry entry behind a failed execution, since the revert left it as it was.
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
- the registry entry: its state when it was read, "None: the network runs this operation directly" for a native kind, "No usable entry: do not sign" when the registry has none, "Could not be read right now" when the relay did not answer;
- approvals as "n of m council signatures", or, for a council rotation, one count for the current council and one for the incoming council, since the schedule waits for both thresholds (see "A rotation collects signatures from two councils" in `docs/ARCHITECTURE.md`);
- the wizard's words: each kind's title and hint, the path chips it travels, the council rule, the gas and expiry rows, who approves, and the one-or-two-transactions CTA.

A pending proposal also says that it runs as soon as the threshold is reached and that it expires, with nothing run, if the threshold is not reached by its expiration time.

## Opening a proposal

`useCreateProposal` sends two transactions: `createProposal` registers the call in `GovernedExecutor`, then a `ScheduleCreate` wraps `execute(id)` for the council to sign, with the proposer's key as admin key. The registry id only comes back through Mirror (`proposalIdFromContractResult`), so the hook waits for indexing with backoff (`waitForMirrorIndexing`). If Mirror still has not indexed the registration, the hook fails with a message saying the entry is registered and must be scheduled, not registered again. `useCreateNativeProposal` schedules a transfer or a council rotation directly, with no registry entry.

Both hooks take an already-encoded proposal from `@sh/core/governance/encode`, which enforces the chain invariants (positive amounts, a reachable threshold, no duplicate council key) before anything becomes a transaction.

The wizard is two components so that it can live in a page or in a side panel. `ProposalWizardProvider` owns the chosen kind, the current draft, its preview and the submit mutation, and reports the new schedule id through `onSubmitted`; `ProposalWizard` renders the picker, the form, the preview and the submit footer, with no route, title or setup guard of its own. The host renders those, gives the wizard a height (it fills it, scrolls its middle and keeps the footer in view) and the level of its headings. Because the submission lives in the provider, closing a panel while the wallet signs does not lose it, and anything else inside the provider — a map drawing the draft — reads the same preview through `useProposalWizard()`. `/governance/new` is the smallest host: the setup guard, a title, and `onSubmitted` routing to the detail page.

The picker is native radio buttons sharing one name across its two groups ("Contract calls · through the registry", "Native · no contract, no registry entry"), so a keyboard moves the choice with the arrow keys. It is disabled while a submission is pending, since picking another kind resets the draft. The wizard says why the button is disabled rather than leaving it greyed out: no wallet connected, a vault upgrade with no `AcmeVaultV2` deployed to point the proxy at, the proposer list still loading or unreadable, an account without `PROPOSER_ROLE` for a contract-backed kind, or a recipient that is malformed, still being looked up, or not an account. The words live in `proposalLabels.ts` with the rest.

`/governance/new` builds a draft from the form through `services/governance/drafts.ts`, which converts amounts without rounding and calls the encoders, and previews it through `decodeScheduledOperation` / `decodeRegistryOperation`: what the proposer reviews is what the detail page will show the council. A body the decoder cannot fully read cannot be submitted. The vault upgrade always runs `initV2(limit)` in the approved call, since `initV2` is a reinitializer anyone could call afterwards. `decodeRegistryOperation` reads the limit back out of that call, so the preview and the detail page both name it; an upgrade that runs any other initializer decodes as unrecognised and is offered no Sign. The schedule's memo is the kind's title.

## Not built yet

- **Three kinds have no form yet**: the treasury swap, token administration and council rotation are encoded and decoded, but the wizard lists only the vault upgrade and the supplier payment.
- **Approvals render as text.** `Proposal.progress` and `Proposal.incomingProgress` carry everything a progress visual needs, including which members signed (`signedBy`).
- **A registry entry that was never scheduled** — the seed proposal `yarn setup` registers is one — has no detail page, since there is no schedule id to route on.
