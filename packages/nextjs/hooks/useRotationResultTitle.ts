import { useCouncilBefore } from "./mirror/useCouncilBefore";
import type { Proposal } from "@sh/core/governance/proposals";
import { rotationResultTitle } from "~~/components/governance/rail/rotationResult";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

type RotationResultContext = { governanceAccountId: string; network: HederaNetworkName; agentSeat: string | null };

/**
 * `rotationResultTitle` for a proposal, reading the council before it only for an executed rotation.
 * "Seated" needs the council before the change, which nothing in the proposal carries: its progress
 * is counted against today's council.
 */
export function useRotationResultTitle(
  { operation, execution, schedule }: Proposal,
  { governanceAccountId, network, agentSeat }: RotationResultContext,
): string | null {
  const rotation = execution.status === "succeeded" && operation.kind === "councilRotation" ? operation : null;
  const before = useCouncilBefore({
    governanceAccountId,
    executedTimestamp: rotation ? schedule.executed_timestamp : null,
    network,
  });
  if (!rotation) return null;
  return rotationResultTitle({
    incoming: rotation.council,
    before: before.data ?? (before.isError ? null : undefined),
    agentSeat,
  });
}
