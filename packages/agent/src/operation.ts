/**
 * What a proposal actually asks for, flattened into the one shape a policy can be written against.
 *
 * A proposal reaches the agent in two layers: the scheduled body, and — for the three kinds that go
 * through `GovernedExecutor` — the registry entry the body's `execute(id)` points at. Reading only
 * the first would tell the policy nothing but "entry 7 of the registry"; reading only the second
 * would miss the HBAR the schedule attaches to the call, which is the part that leaves the treasury.
 * So both are read here and the result is one flat operation.
 *
 * Everything that makes a proposal unreadable is also decided here, and every one of those is a
 * refusal rather than a shrug. An agent that cannot tell what it is being asked to approve has
 * exactly one safe answer.
 */
import { ContractId } from "@hiero-ledger/sdk";
import type { HbarTransfer, TokenAdminOperation, TokenTransfer } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";

export type GovernedOperation =
  | { kind: "upgrade"; target: string; implementation: string; hasInitializer: boolean }
  | {
      kind: "treasurySwap";
      tokenOut: string;
      recipient: string;
      /** What the stored call asks to swap. */
      amountInTinybars: bigint;
      /** What the scheduled transaction actually sends with it. The policy checks the two agree. */
      payableTinybars: bigint;
    }
  | { kind: "tokenAdmin"; operation: TokenAdminOperation; token: string; account: string | null }
  | { kind: "treasuryTransfer"; hbar: HbarTransfer[]; tokens: TokenTransfer[] }
  | { kind: "councilRotation" };

export type ReadOperation = { readable: true; operation: GovernedOperation } | { readable: false; reason: string };

const unreadable = (reason: string): ReadOperation => ({ readable: false, reason });

/** A scheduled call can name the executor by id or by EVM address, and both mean the same contract. */
function isThisExecutor(named: string, executorContractId: string): boolean {
  if (named === executorContractId) return true;
  return named.toLowerCase() === `0x${ContractId.fromString(executorContractId).toEvmAddress()}`.toLowerCase();
}

export function readOperation(proposal: Proposal, executorContractId: string): ReadOperation {
  const { operation } = proposal;

  if (operation.kind === "unrecognized") return unreadable(`the scheduled body is unreadable: ${operation.reason}`);
  if (operation.kind === "treasuryTransfer") {
    return { readable: true, operation: { kind: "treasuryTransfer", hbar: operation.hbar, tokens: operation.tokens } };
  }
  if (operation.kind === "councilRotation") return { readable: true, operation: { kind: "councilRotation" } };

  if (!isThisExecutor(operation.executorContractId, executorContractId)) {
    return unreadable(`the call goes to ${operation.executorContractId}, which is not this agent's executor`);
  }

  // The entry is the operation. Signing without it would be approving an id, and the inbox already
  // distinguishes an entry that says no from one that could not be asked — only the second is a
  // transient condition, and neither is a reason to sign.
  const { registry } = proposal;
  if (registry.status === "missing") return unreadable(`the registry has no entry ${operation.proposalId}`);
  if (registry.status === "unreachable") return unreadable(`the registry could not be read: ${registry.reason}`);
  if (registry.status === "notApplicable") return unreadable("the registry entry behind this proposal was not read");
  if (registry.entry.state !== "pending") return unreadable(`the registry entry is already ${registry.entry.state}`);

  const entry = registry.entry.operation;
  switch (entry.kind) {
    case "upgrade":
      return {
        readable: true,
        operation: {
          kind: "upgrade",
          target: entry.target,
          implementation: entry.implementation,
          // Anything longer than the `0x` an empty calldata decodes to is code nested in the upgrade.
          hasInitializer: entry.initializerCalldata.length > 2,
        },
      };
    case "treasurySwap":
      return {
        readable: true,
        operation: {
          kind: "treasurySwap",
          tokenOut: entry.tokenOut,
          recipient: entry.recipient,
          amountInTinybars: entry.amountInTinybars,
          payableTinybars: operation.payableTinybars,
        },
      };
    case "tokenAdmin":
      return {
        readable: true,
        operation: {
          kind: "tokenAdmin",
          operation: entry.operation,
          token: entry.token,
          account: entry.account,
        },
      };
    case "unrecognized":
      return unreadable(`the registry entry is unreadable: ${entry.reason}`);
  }
}
