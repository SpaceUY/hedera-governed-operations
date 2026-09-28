/**
 * The path each kind of proposal takes through the system once the council approves it, written in
 * roles rather than in contracts, so the same route holds for any deployment of this template. A
 * screen that draws the governance graph resolves the roles against its own nodes (`scopeOf` in
 * `graph.ts`); this file only says which roles a kind passes through, in order, and which ledger
 * entities the decoded operation names for them.
 *
 * The routes follow the trust chain the contracts enforce: a contract kind leaves the governance
 * account, reaches the executor, which is the only caller its target accepts, and goes on from
 * there. The two native kinds never touch the executor: the network runs them directly.
 */
import type { ProposalKind, RegistryOperation, ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";

/**
 * - `governanceAccount`, `executor`: the two fixed points of the trust chain.
 * - `subject`: the contract the executor calls, read from the registry entry.
 * - `token`: the HTS token a token-admin operation acts on.
 * - `router`: the DEX the subject of a swap calls. The operation does not name it; the graph knows
 *   it as the node the subject has authority over.
 * - `recipient`: where value ends up — the swap's `recipient`, a transfer's credited accounts.
 * - `member`: a council key, for a rotation both the current and the incoming ones.
 */
export type RouteRole = "governanceAccount" | "executor" | "subject" | "token" | "router" | "recipient" | "member";

export type RouteStep = { from: RouteRole; to: RouteRole };

export const PROPOSAL_ROUTES: Record<ProposalKind, readonly RouteStep[]> = {
  upgrade: [
    { from: "governanceAccount", to: "executor" },
    { from: "executor", to: "subject" },
  ],
  treasurySwap: [
    { from: "governanceAccount", to: "executor" },
    { from: "executor", to: "subject" },
    { from: "subject", to: "router" },
    // The router settles the output straight to the recipient; the adapter never holds it.
    { from: "router", to: "recipient" },
  ],
  tokenAdmin: [
    { from: "governanceAccount", to: "executor" },
    { from: "executor", to: "subject" },
    { from: "subject", to: "token" },
  ],
  treasuryTransfer: [{ from: "governanceAccount", to: "recipient" }],
  // A rotation changes the governance account's own key: every seat that is kept, lost or gained.
  councilRotation: [{ from: "member", to: "governanceAccount" }],
};

/**
 * A proposal as far as it could be decoded: the operation itself for every kind, including the
 * contract kinds whose operation lives in the registry entry rather than in the scheduled body.
 */
export type DecodedOperation =
  | Exclude<ScheduledOperation, { kind: "registryCall" | "unrecognized" }>
  | Exclude<RegistryOperation, { kind: "unrecognized" }>
  | { kind: "unrecognized"; reason: string };

/**
 * The operation behind a proposal. A registry call only says which entry it runs, so without an
 * entry that was read there is nothing to describe: a missing entry, one the relay could not be
 * asked about, and one on some other executor all come back `unrecognized`.
 */
export function decodedOperationOf(proposal: Pick<Proposal, "operation" | "registry">): DecodedOperation {
  const { operation, registry } = proposal;
  if (operation.kind !== "registryCall") return operation;
  if (registry.status !== "read") {
    return { kind: "unrecognized", reason: "the registry entry this proposal runs could not be read" };
  }
  return registry.entry.operation;
}

/**
 * Ledger entities the operation names for a role: `0.0.x` ids, EVM addresses, or base64 keys for
 * `member`. A role left out is resolved by the graph alone. `governanceAccount` is only filled in
 * when the operation says which account it acts on, so the graph can refuse a body that moves an
 * account other than the one it governs.
 */
export type RouteRefs = Partial<Record<RouteRole, string[]>>;

export type OperationRoute = { kind: ProposalKind; steps: readonly RouteStep[]; refs: RouteRefs };

function transferRefs(operation: Extract<DecodedOperation, { kind: "treasuryTransfer" }>): RouteRefs {
  const movements = [
    ...operation.hbar.map(({ accountId, tinybars }) => ({ accountId, amount: tinybars })),
    ...operation.tokens.map(({ accountId, amount }) => ({ accountId, amount })),
  ];
  const accountsWhere = (moved: (amount: bigint) => boolean) => [
    ...new Set(movements.filter(({ amount }) => moved(amount)).map(({ accountId }) => accountId)),
  ];
  return { governanceAccount: accountsWhere(amount => amount < 0n), recipient: accountsWhere(amount => amount > 0n) };
}

function refsOf(operation: Exclude<DecodedOperation, { kind: "unrecognized" }>): RouteRefs {
  switch (operation.kind) {
    case "upgrade":
      return { subject: [operation.target] };
    case "treasurySwap":
      return { subject: [operation.target], recipient: [operation.recipient] };
    case "tokenAdmin":
      return { subject: [operation.target], token: [operation.token] };
    case "treasuryTransfer":
      return transferRefs(operation);
    case "councilRotation":
      return { governanceAccount: [operation.accountId], member: operation.council.memberKeys };
  }
}

/** The route an operation takes and what it names along it; null for a body nobody can describe. */
export function routeOf(operation: DecodedOperation): OperationRoute | null {
  if (operation.kind === "unrecognized") return null;
  return { kind: operation.kind, steps: PROPOSAL_ROUTES[operation.kind], refs: refsOf(operation) };
}
