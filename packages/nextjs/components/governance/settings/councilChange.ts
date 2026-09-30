/**
 * The council change Settings composes: which seats hold a key and how many must sign, turned into the
 * same rotation draft the wizard's forms produce. The encoder (`buildCouncilRotation`, through
 * `draftCouncilRotation`) is what refuses a council that could never approve anything — no members, a
 * repeated key, an unreachable threshold — and its words are shown as they are. What this module
 * adds is the composing itself, and the warnings about councils that are legal but risky.
 */
import type { UnseatedAgent } from "./useUnseatedAgent";
import { type CouncilKey, memberPublicKey } from "@sh/core/governance/council";
import { type DraftResult, draftCouncilRotation, tryDraft } from "~~/services/governance/drafts";

/** The council being composed: the seats ticked, as `CouncilKey.memberKeys` writes them, and the signatures required. */
export type CouncilChange = { memberKeys: string[]; threshold: number };

export const changeFrom = (council: CouncilKey): CouncilChange => ({
  memberKeys: [...council.memberKeys],
  threshold: council.threshold,
});

/** The seats a change may hold: the council's, then the co-signing agent's while it is not seated and could sign. */
export function offeredSeatsOf(council: CouncilKey, unseatedAgent: UnseatedAgent | null): string[] {
  if (unseatedAgent?.check.status !== "found") return council.memberKeys;
  return [...council.memberKeys, unseatedAgent.seat];
}

const clamp = (threshold: number, seats: number): number => Math.max(1, Math.min(threshold, seats));

/** Ticks or unticks one seat. The seats stay in the order they are offered, and the threshold within them. */
export function toggleSeat(change: CouncilChange, seat: string, offered: readonly string[]): CouncilChange {
  const ticked = change.memberKeys.includes(seat)
    ? change.memberKeys.filter(key => key !== seat)
    : [...change.memberKeys, seat];
  const memberKeys = offered.filter(key => ticked.includes(key));
  return { memberKeys, threshold: clamp(change.threshold, memberKeys.length) };
}

/**
 * The change once the offered seats move, as accounts are added or removed: the seats `joining` come in
 * ticked, a seat no longer offered drops out, and the threshold stays within the seats.
 */
export function reoffer(change: CouncilChange, offered: readonly string[], joining: readonly string[]): CouncilChange {
  const memberKeys = offered.filter(key => change.memberKeys.includes(key) || joining.includes(key));
  return { memberKeys, threshold: clamp(change.threshold, memberKeys.length) };
}

export function stepThreshold(change: CouncilChange, step: 1 | -1): CouncilChange {
  return { ...change, threshold: clamp(change.threshold + step, change.memberKeys.length) };
}

export function isChanged(change: CouncilChange, council: CouncilKey): boolean {
  return (
    change.threshold !== council.threshold ||
    change.memberKeys.length !== council.memberKeys.length ||
    change.memberKeys.some(key => !council.memberKeys.includes(key))
  );
}

export type SeatTag = "joins" | "leaves";

export function seatTagOf(seat: string, change: CouncilChange, council: CouncilKey): SeatTag | null {
  const ticked = change.memberKeys.includes(seat);
  const seated = council.memberKeys.includes(seat);
  if (ticked && !seated) return "joins";
  if (!ticked && seated) return "leaves";
  return null;
}

export type CouncilRisk = "anyOneKey" | "oneLostKeyFreezes" | "viewerLeaves";

/** The first thing worth a warning about a legal council, in the order they weigh: who can act alone, then who could lock it. */
export function councilRiskOf(
  change: CouncilChange,
  council: CouncilKey,
  viewerSeat: string | null,
): CouncilRisk | null {
  const seats = change.memberKeys.length;
  if (seats > 1 && change.threshold === 1) return "anyOneKey";
  if (seats > 1 && change.threshold === seats) return "oneLostKeyFreezes";
  if (viewerSeat && council.memberKeys.includes(viewerSeat) && !change.memberKeys.includes(viewerSeat)) {
    return "viewerLeaves";
  }
  return null;
}

/** Why a legal council could never run: `otherKeys` are the seats besides the agent's, too few for the threshold. */
export type CouncilBlock = { reason: "agentNeverSignsRotation"; otherKeys: number };

/**
 * A change that can never execute. The co-signing agent never signs a council rotation, and the proposed
 * council has to reach its own threshold, so with the agent ticked the other seats must reach it alone.
 */
export function councilBlockOf(change: CouncilChange, agentSeat: string | null): CouncilBlock | null {
  if (!agentSeat || !change.memberKeys.includes(agentSeat)) return null;
  const otherKeys = change.memberKeys.length - 1;
  if (change.threshold <= otherKeys) return null;
  return { reason: "agentNeverSignsRotation", otherKeys };
}

/**
 * Whether the current council needs the agent's seat to reach its own threshold. A rotation waits for
 * both councils' thresholds and the agent never signs one, so then no change, whatever it proposes, could run.
 */
export function currentCouncilNeedsAgent(council: CouncilKey, agentSeat: string | null): boolean {
  if (!agentSeat || !council.memberKeys.includes(agentSeat)) return false;
  return council.threshold > council.memberKeys.length - 1;
}

/** The rotation to schedule, or nothing while the composition is the council the ledger already has. */
export function draftCouncilChange(
  governanceAccountId: string,
  change: CouncilChange,
  council: CouncilKey,
): DraftResult {
  if (!isChanged(change, council)) return { status: "empty" };
  return tryDraft(() =>
    draftCouncilRotation(
      { governanceAccountId },
      {
        memberKeys: change.memberKeys.map(memberPublicKey),
        threshold: change.threshold,
      },
    ),
  );
}
