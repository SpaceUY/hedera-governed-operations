/**
 * Demo only: "Sign as Alice" / "Sign as Bob". `yarn setup` creates two demo accounts, seats their keys
 * in the treasury account's threshold key and keeps the private keys in the gitignored
 * `setup-state.json`. The rail offers a button on each demo member's row while the proposal still
 * waits on that member, and the server route `/api/demo/signers` signs the `ScheduleSign` with that
 * member's key, so one person with one wallet can watch a threshold complete. The keys never leave
 * the server, and the server never signs for the co-signing agent's seat.
 *
 * This file is what the browser may import: the shapes the route speaks, the rule for whom a proposal
 * waits on, and the two requests. The keys are read in `demoSignerServer.ts`.
 *
 * Removing the feature takes two steps:
 *   1. delete `app/api/demo/`, `services/demoSigners/`, `hooks/useDemoSigners.ts` and
 *      `components/governance/demo/`;
 *   2. remove the `useDemoSeats` import, its call, the two `seatExtras` props and the note from
 *      `components/governance/rail/ProposalDetailPanel.tsx`.
 */
import type { CouncilKey, ThresholdProgress } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import type { DemoAccountName } from "~~/scripts/setup/state";
import { canBeSigned } from "~~/services/governance/proposalActions";

export const DEMO_SIGNERS_ROUTE = "/api/demo/signers";

export type DemoMemberName = DemoAccountName;

/** A demo member as the browser sees it: everything public, nothing that signs. */
export type DemoMember = {
  name: DemoMemberName;
  accountId: string;
  /** Raw public key in base64, the form `CouncilKey.memberKeys` and `ThresholdProgress.signedBy` use. */
  publicKey: string;
};

/**
 * What `GET` answers. An empty list means this server signs for nobody; `unavailableReason` says why
 * when the reason is one a developer can fix (no co-signing agent configured or recorded, or its
 * account unreadable), so a screen or a `curl` can tell it apart from "no demo keys here".
 */
export type DemoSignersResponse = { members: DemoMember[]; unavailableReason?: string };

export type DemoSignRequest = { scheduleId: string; member: DemoMemberName };

export type DemoSignResponse = { transactionId: string };

export type DemoSignErrorResponse = { error: string };

/** The facts that decide whether a proposal still waits on a key: who governs, who signed, and what it does. */
export type SignatureFacts = Pick<Proposal, "progress" | "incomingProgress" | "operation"> & { council: CouncilKey };

type CouncilSide = { council: CouncilKey; progress: ThresholdProgress };

/** A council rotation waits on both councils (see `Proposal.incomingProgress`), every other kind on one. */
function councilSides({ council, progress, incomingProgress, operation }: SignatureFacts): CouncilSide[] {
  const sides = [{ council, progress }];
  if (operation.kind === "councilRotation" && incomingProgress) {
    sides.push({ council: operation.council, progress: incomingProgress });
  }
  return sides;
}

/**
 * Whether a signature by this key would still count: the key holds a seat on a council the proposal
 * waits for, and that council has not seen it yet. Counting members rather than rows is what
 * `countThresholdSignatures` already did to produce `signedBy`.
 */
export function awaitsSignatureFrom(publicKey: string, facts: SignatureFacts): boolean {
  return councilSides(facts).some(
    ({ council, progress }) => council.memberKeys.includes(publicKey) && !progress.signedBy.includes(publicKey),
  );
}

/** The demo members a proposal still waits on: none unless anyone may be asked to sign it. */
export function demoMembersToOffer(
  members: readonly DemoMember[],
  proposal: Proposal,
  council: CouncilKey,
): DemoMember[] {
  if (!canBeSigned(proposal)) return [];
  return members.filter(member => awaitsSignatureFrom(member.publicKey, { ...proposal, council }));
}

export function demoMemberLabel(name: DemoMemberName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function refusalOf(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) return "";
  return typeof body.error === "string" ? body.error : "";
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    throw new Error(refusalOf(body) || `The demo signer answered ${response.status}`);
  }
  return body as T;
}

export async function fetchDemoMembers(): Promise<DemoMember[]> {
  const { members } = await readJson<DemoSignersResponse>(await fetch(DEMO_SIGNERS_ROUTE));
  return members;
}

export async function requestDemoSignature(request: DemoSignRequest): Promise<DemoSignResponse> {
  const response = await fetch(DEMO_SIGNERS_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scheduleId: request.scheduleId, member: request.member }),
  });
  return readJson<DemoSignResponse>(response);
}
