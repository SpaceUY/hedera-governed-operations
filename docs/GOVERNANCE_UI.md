# Governance UI — frontend architecture plan

Working plan for the Governed Operations interface (the live map, the proposal wizard, and everything around them). The mechanism and screens are specified in the design prompt used to brief the prototype tool (v0/Lovable/Figma Make); this document is the engineering-facing counterpart — how that screen maps onto this codebase.

**Starting point:** the backend side of this feature is already implemented and is the source of truth — `GovernedExecutor`, `AcmeVault`/`AcmeVaultV2`, `TokenAdmin`, `SaucerSwapAdapter` (all in `packages/hardhat/contracts/`), and the transaction builders in `packages/nextjs/services/governance/schedules.ts`. **Council reads and proposal listing are real and merged** — `services/governance/council.ts`, `services/governance/proposals.ts` (the inbox), `hooks/mirror/useCouncil.ts`, `hooks/mirror/useProposals.ts`. **A full decode/encode layer for all five operation types is real and merged** — `services/governance/decode.ts`, `encode.ts`, `proposalTypes.ts`, and an extended `registry.ts` — see below; treat it as the source of truth for anything to do with reading what a proposal *is* or building one, not something to rebuild. **The base screens are built too**: the governance home at `/` (treasury figures, threshold, pending proposals), the detail page at `/governance/[scheduleId]` with Sign / Withdraw / Cancel, `services/governance/treasury.ts`, `useTreasuryFigures`, `useProposalLookup` and the five mutation hooks. The live map and the wizard are still to be built. Everything below builds on top of that code rather than duplicating it, using the same services → hooks → components layering the Proof Wall module already uses (see "How to add an operation" in `AGENTS.md`).

## Routing decision

Confirmed: the live map becomes `app/page.tsx` (the new `/`), since it's the hero screen a judge sees first. Proof Wall moves to `app/proof-wall/page.tsx` and gets a link from the header instead of owning the root.

## Directory layout

```
packages/nextjs/
  app/
    page.tsx                    # Home / live map — becomes the new root (see decision above)
    proof-wall/page.tsx         # existing ProofWall content, moved
    governance/
      new/page.tsx              # wizard
      [scheduleId]/page.tsx     # detail — scheduleId is the canonical param (see below)
      settings/page.tsx

  components/governance/
    graph/
      GraphCanvas.tsx            # composes the fixed hand-laid-out SVG scene
      nodes/AccountNode.tsx
      nodes/ContractNode.tsx
      nodes/TokenNode.tsx
      nodes/TreasuryNode.tsx      # renders SignatureRing
      GraphEdge.tsx               # one component, state prop drives rest/preview/inProgress/complete/failed/value
      SignatureRing.tsx
      Legend.tsx
      VerticalGraphList.tsx       # phone fallback, same data
    rail/
      TreasuryBar.tsx
      PendingOperationsList.tsx
      OperationCard.tsx
      CouncilPanel.tsx
      CouncilMemberRow.tsx
    wizard/
      OperationTypePicker.tsx
      CouncilPreviewPanel.tsx     # "what the council will see"
      forms/UpgradeVaultForm.tsx
      forms/SwapForm.tsx
      forms/TokenOpForm.tsx
      forms/TransferForm.tsx
      forms/RotateCouncilForm.tsx
    detail/
      ProposalDetailPanel.tsx     # same badge/dl convention as ScheduleStateCard
      ApproverList.tsx
      WithdrawCancelActions.tsx   # two distinct actions: ScheduleDelete vs GovernedExecutor.cancel

  hooks/mirror/                   # read hooks live alongside useSchedule/useCouncil/useProposals — the existing convention for Mirror-backed reads
    useCouncil.ts                 # already implemented: key + threshold + proposerAccountIds + unresolvableProposers
    useProposals.ts               # already implemented: the inbox, each row carrying its decoded operation, outgoing/incoming progress and registry cross-check
    useProposalLookup.ts          # already implemented: one proposal by schedule id, for a direct link not necessarily inside the inbox's page window
    useTreasuryFigures.ts         # already implemented: HBAR / USDC / ACME / vault reserve

  hooks/                          # mutation hooks live flat, matching useSubmitProof.ts/useCreateTopic.ts's existing convention
    useCreateProposal.ts          # contract types: createProposal + ScheduleCreate(execute), given an already-encoded RegistryProposal
    useCreateNativeProposal.ts    # native types: ScheduleCreate(transfer / AccountUpdate), given an already-built Transaction
    useSignProposal.ts            # ScheduleSign
    useWithdrawProposal.ts        # ScheduleDelete
    useCancelProposal.ts          # GovernedExecutor.cancel

  services/governance/
    schedules.ts                  # already implemented, extended: buildExecuteProposalCall now takes payableTinybars for a treasury swap
    council.ts                    # already implemented: fetchCouncilKey/isSignedByKey/countThresholdSignatures/fetchProposerAccountIds/councilKeyOf — see below
    proposalTypes.ts              # already implemented: the five operation kinds, their gas figures, ScheduledOperation/RegistryOperation shapes
    decode.ts                     # already implemented: decodeScheduledOperation/decodeRegistryOperation for all five kinds, from raw bytes only
    encode.ts                     # already implemented: one encoder per kind, chain invariants enforced here (see below)
    registry.ts                   # already implemented, extended: proposalIdFromContractResult, fetchRegistryEntries (registry↔schedule cross-check), buildCancelProposalCall
    proposals.ts                  # already implemented: the inbox — fetchProposalInbox, each row crossed against the registry
    treasury.ts                   # already implemented: balance aggregation (HBAR, ACME HTS balance, USDC balance, vault reserve view call)

  config/governanceConfig.ts      # already implemented: entity ids/env — mirrors config/proofWallConfig.ts. Gas figures and cancel's gas live in proposalTypes.ts/registry.ts, not duplicated here.
```

The graph/animation pieces from the original design prompt (`components/governance/graph/*`, `services/store/graphUiStore.ts`, `useProposalAnimationSync.ts`) are the real prototype's territory, not this base-structure pass — see the implementation plan's Scope boundaries.

The services layer needs no new files for the remaining screens — decode/encode/registry cover reading and building every one of the five operation types, and treasury figures, the lookup by schedule id, the mutation hooks and the two base pages already exist. What's left is presentation: the live map and the wizard.

## Componentization principles

- One file per node *kind*, not one `GraphNode` with a switch — matches the "delete what you don't need" ethos: a developer who rips out the swap feature deletes `ContractNode`'s swap-adapter usage and `SwapForm.tsx`, nothing else.
- `GraphEdge` is the one component every relationship goes through, parameterized by state (`rest | preview | inProgress | complete | failed | value`) — never a bespoke line per screen.
- Reuse `@scaffold-hbar-ui/components` (`Address`, `Balance`, `HbarInput`) inside these components instead of rebuilding formatting/inputs — no new component library, per constraint.
- `ProposalDetailPanel` extends the exact badge/`dl` convention already established in `components/explorer/ScheduleStateCard.tsx` (`badge-warning/success/error/neutral`, `dt`/`dd` grid) rather than inventing a new detail-panel pattern.
- Every mutation hook follows the documented 3-layer pattern (service builds+freezes → hook wraps in `useMutation` and calls `requireAccountId()` → component), exactly like `useSubmitProof`/`useCreateTopic` today.

## State management

Two layers, mapped onto what's already in this codebase:

1. **Domain truth → React Query**, following the existing `hooks/mirror/mirrorQuery.ts` conventions verbatim (`resolvePendingRefetchInterval`, same 5s poll-while-pending). `useProposal`, `useProposals`, `useCouncil`, and `useTreasuryFigures` are new query hooks in that same shape — nothing new to learn, no new library. This is what satisfies "the backend is source of truth, no refresh needed": components never set proposal/signature state themselves, they only read what the last poll returned.

2. **Ephemeral UI/animation state → one small Zustand store** (`graphUiStore.ts`), extending the *existing* precedent (`services/store/store.ts` already holds one cross-cutting concern, `targetNetwork`, in exactly this shape). It holds only: `selectedOperationId`, a per-node/per-edge animation-phase map, and `reducedMotionOverride`. It never holds proposal data — only which visual state each graph piece is currently in.

3. **The bridge is `useProposalAnimationSync(proposal)`**: on every React Query poll tick it diffs the previous snapshot against the new one (signature count up, status flipped to executed/failed) and pushes the corresponding phase transition into `graphUiStore`. This is the one piece of net-new logic that makes "poll → diff → animate" real instead of "click → animate" — and it's the one hook a future real-time integration (e.g. a Mirror Node subscription) would replace, with zero changes to any component.

No Redux, no Context provider, no new state library — Zustand is already a dependency and already used exactly this way for one concern; adding a second store for the graph's UI state is the smallest change that keeps the two kinds of state (server-derived vs. purely visual) from ever being written to the same place.

## Reading and building a proposal — `council.ts`, `proposalTypes.ts`, `decode.ts`, `encode.ts`, `registry.ts`

The treasury account's `ThresholdKey`/`KeyList`, and every one of the five operation types, decode client-side with no network call beyond the one Mirror read that hands over the raw bytes. This whole layer already exists — anything built on top of it should call into these files, never duplicate their decoding or their invariant checks.

**Council key decoding**, `services/governance/council.ts`:

```ts
export type CouncilKey = {
  threshold: number;
  /** Base64-encoded, the way Mirror writes a schedule's public_key_prefix. */
  memberKeys: string[];
};

export type ThresholdProgress = { signed: number; threshold: number; signedBy: string[] };

export async function fetchCouncilKey(governanceAccountId: string, network: HederaNetworkName): Promise<CouncilKey>;
/** Whether any signature on the schedule matches this key (hex, no `0x`). The one rule approval counting is built on. */
export function isSignedByKey(schedule: MirrorSchedule, publicKeyHex: string): boolean;
export function countThresholdSignatures(schedule: MirrorSchedule, council: CouncilKey): ThresholdProgress;

export type ProposerAccounts = { accountIds: string[]; unresolvable: string[] };
export async function fetchProposerAccountIds(options: { executorContractId: string; network: HederaNetworkName; rpcUrl: string }): Promise<ProposerAccounts>;
/** Turns an already-decoded proto.IKey into a CouncilKey — shared with decode.ts's council-rotation case. */
export function councilKeyOf(key: proto.IKey): CouncilKey;
```

It hand-walks `proto.IKey`'s `thresholdKey`/`keyList` fields directly rather than relying on the SDK's undocumented `Key._fromProtobufKey`/`KeyList`. A plain `keyList` with no `threshold` is treated as needing every member (n-of-n); a single-key account throws rather than reporting "1 of 1"; a member that is itself a nested key list or a contract id throws too, since a signature can never be matched to it.

**Matching a member to a signature happens in hex, not base64.** `MirrorScheduleSignature.public_key_prefix` genuinely can be a *prefix*, and base64 does not preserve byte-prefix boundaries (it packs 3 bytes into 4 characters) — `council.ts`'s own tests prove the general rule: a signature carrying only the first two bytes (`"A8ZO"`, base64) correctly matches a member's full key.

**A proposer that is not an account does not break the council read.** `grantRole` accepts any address, and an EVM address is only a Hedera account once something funds it, so Mirror can answer 404 for a role holder. `fetchProposerAccountIds` keeps those addresses in `unresolvable` instead of failing; `useCouncil` exposes them as `unresolvableProposers` and the inbox folds them into `unreachableProposers`. **The inbox is allowed to be partial**, and `unreachableProposers` covers both causes (Mirror unreadable for a proposer, or no account behind the address). Any screen listing proposals has to say so when it is non-empty rather than present a short list as complete; the home page shows a warning for this.

**Every read through the JSON-RPC relay uses `createRelayClient`** (`services/web3/relayClient.ts`), never a hand-built `createPublicClient`. It sets one retry instead of viem's default three, because these reads already sit under React Query polling: extra retries only hold a read open, and a relay that stays down is asked again on the next poll anyway. A new relay read (a vault view, a registry call) goes through it.

**Counting approvals, not signature rows.** `signatures.length` is not `m` — Mirror adds a row for the `ScheduleCreate` payer and another for every `ScheduleSign` payer, neither of which counts toward the threshold unless that payer also happens to hold a council seat. `countThresholdSignatures` counts **members**, not rows, dedupes a member appearing in multiple rows, and returns `signedBy` in the council's own stable order. Matching one key (for example the connected wallet's, to show "you have signed") goes through `isSignedByKey`, not a second copy of the prefix comparison. See `docs/ARCHITECTURE.md`'s "Counting approvals, not signatures" for the full writeup.

**Every one of the five operation types decodes from raw bytes**, `services/governance/decode.ts` + `proposalTypes.ts`:

```ts
export type ScheduledOperation =
  | { kind: "registryCall"; executorContractId: string; proposalId: number; gas: number; payableTinybars: bigint }
  | { kind: "treasuryTransfer"; hbar: HbarTransfer[]; tokens: TokenTransfer[] }
  | { kind: "councilRotation"; accountId: string; council: CouncilKey }
  | { kind: "unrecognized"; reason: string };

export function decodeScheduledOperation(transactionBody: string): ScheduledOperation;

export type RegistryOperation =
  | { kind: "upgrade"; target: string; implementation: string; initializerCalldata: string }
  | { kind: "treasurySwap"; target: string; tokenOut: string; fee: number; recipient: string; amountInTinybars: bigint; amountOutMinimum: bigint; deadline: number }
  | { kind: "tokenAdmin"; target: string; operation: "pause" | "unpause" | "freeze" | "unfreeze"; token: string; account: string | null }
  | { kind: "unrecognized"; target: string; calldata: string; reason: string };

export function decodeRegistryOperation(target: string, calldata: string): RegistryOperation;
```

Nothing here throws on a body it does not recognize — anyone can open a schedule the governance account pays for, so the inbox will meet bodies that are none of the five kinds, and a decoder that threw would take the whole list down with it. Every unrecognized case carries a `reason` string instead. The schedule's memo is deliberately never consulted for what an operation *is* — it is free text the proposer chose, a label and never evidence — and a body that changes more than the decoder understood (e.g. an `AccountUpdate` that also touches the account's other fields, not just its key) is reported as `unrecognized` rather than silently described as only a council rotation, since the council approves what it is shown.

**The council rotation this template governs (operation #5) needs two thresholds on the same schedule, not one — confirmed on a real testnet rotation.** A scheduled `AccountUpdateTransaction` that replaces the treasury account's `ThresholdKey` does not execute once the *current* (outgoing) council's threshold is met; it stays pending — it does not fail or error — until the **incoming** council's threshold (the one the new key represents) is *also* met, by members signing the same schedule. A 2-of-3 → 2-of-3 rotation needs 4 total signatures, 2 from each side, and a real rotation showed the outgoing side reaching its own threshold immediately while the schedule stayed pending for another ~36 seconds, executing only once the incoming side's second signature landed. `decodeScheduledOperation`'s `councilRotation` case decodes the incoming council with `councilKeyOf`, the exact same function `fetchCouncilKey` uses for the current one — so `countThresholdSignatures(schedule, operation.council)` gives the incoming progress with no new matching logic. Any component showing approval progress needs **two** optional slots, not one — `useProposals`' inbox rows already carry both (`progress` and `incomingProgress`), and the other four operation types simply leave the second one `null`.

**Two more decoding details worth knowing before rendering one on screen:**
- A `treasuryTransfer`'s token movements come back as `{ tokenId, accountId, amount }` in the token's smallest, uninterpreted unit — reading its decimals is a separate Mirror call and is deliberately not this decoder's job. The list comes back ordered by account id, the way the network canonicalizes it, **not** in the order the transfer was built — so the debited side is not reliably the first entry; filter by the sign of `amount`, never by position.
- A registry-backed proposal's HBAR amount (a treasury swap's `amountIn`) never appears in `execute(id)`'s calldata — `execute` only takes the proposal id. It travels as the scheduled transaction's own payable value instead (`ScheduledOperation`'s `payableTinybars`), which is why `buildExecuteProposalCall` (in `schedules.ts`) now takes a `payableTinybars` parameter, and why a decoder that only reads a call's arguments would report a treasury swap as moving nothing.

**Building the five kinds**, `services/governance/encode.ts` + the extended `registry.ts`: one encoder per kind (`encodeUpgrade`, `encodeTreasurySwap`, `encodeTokenAdmin` for the three contract-backed kinds; `buildTreasuryTransfer`, `buildCouncilRotation` for the two native ones), plus `buildCreateProposalCall`/`buildCancelProposalCall` to register or retire a registry entry. **Chain invariants are enforced in the encoders, not left to whatever form calls them** — a positive swap amount, a positive transfer amount, a reachable council threshold, and no duplicate key in a proposed council are all checked here, so a bad value fails before it ever becomes a transaction, regardless of which form (or lack of one) produced it.

**Getting the id `createProposal` returns**, `registry.ts`'s `proposalIdFromContractResult(result: MirrorContractResult): number | null`: a signer only ever returns a transaction id, never a function's return value, so the registry id has to be read back from the Mirror-recorded contract result. This is what lets a create flow chain straight into scheduling `execute(id)` next, and it decodes the function's actual `returns (uint256 id)` value — simpler and more direct than decoding the `ProposalCreated` event log for the same id, which was an earlier, since-abandoned approach.

**Telling a schedule's registry entry apart from the schedule itself**, `registry.ts`'s `fetchRegistryEntries`: the schedule and the registry entry behind a contract-backed proposal are two separate records of "still alive," and they can disagree — `GovernedExecutor.cancel(id)` retires the entry directly, with no schedule and no quorum, leaving a schedule that still looks pending. Reading `proposal(id)` distinguishes `missing` (the id was never registered — refuse to sign, the same as a cancelled entry) from `unreachable` (the relay simply failed to answer — warn, don't refuse). `useProposals`' inbox rows already carry this cross-check for every pending, registry-backed proposal.

## Remaining open items

- **Everything above is solved,** not open — listed in this document so a later reader has the full picture in one place, not because any of it is still to design.
- **`.harness/prd.md` and `.harness/eval.json`** don't reference this feature at all yet — once the screens exist, they need the new routes and assertions added per "How to add a harness eval assertion" in `AGENTS.md`, or `validate`/`validate-semantic` will keep testing only the Proof Wall paths.
- **Treasury figure sourcing is settled** in `services/governance/treasury.ts`: HBAR, ACME and USDC are the governance account's current balances from one Mirror account read, and the vault reserve is `AcmeVault.totalDeposits()` through the relay (a running total, so an upgrade that allows withdrawals keeps reporting the right figure).
- **A contract-type proposal registered but never scheduled** (the setup script's own seed proposal is one — `createProposal` only, no `ScheduleCreate`) has no detail page in this pass, now that the canonical route param is the schedule id: there is no schedule id to route on until it is scheduled. Accepted, documented scope choice — see the implementation plan's Scope boundaries — not an oversight.
- **A schedule not present in the inbox's visible page window** (older than the per-proposer cutoff, or a native proposal opened by an account outside `PROPOSER_ROLE`) is looked up directly by `useProposalLookup`, which returns the same `Proposal` shape as the inbox and refuses a schedule the governance account does not pay for.
