/**
 * Demo only: "Sign as Alice" / "Sign as Bob". `yarn setup` creates two demo accounts and puts their
 * keys in the governance account's threshold key, keeping the private keys in the gitignored
 * `setup-state.json`. The detail page offers a button per demo member who still has to sign, and the
 * server route `/api/hedera/demo-signers` signs the `ScheduleSign` with that member's key, so the
 * demo reaches its threshold without three wallets. The keys never leave the server.
 *
 * This file is what the browser may import: the shapes the route speaks, the rule for whom a
 * proposal waits on, and the two requests. The keys are read in `demoSignerServer.ts`.
 *
 * Removing the feature takes two steps:
 *   1. delete `services/demoSigners/`, `app/api/hedera/demo-signers/`, `hooks/useDemoSigners.ts` and
 *      `components/governance/DemoSignButtons.tsx`;
 *   2. remove the `DemoSignButtons` import and element from `app/(governance)/governance/[scheduleId]/page.tsx`.
 */
import type { DemoAccountName } from "~~/scripts/setup/state";
import { type CouncilKey, type ThresholdProgress } from "~~/services/governance/council";
import { canBeSigned } from "~~/services/governance/proposalActions";
import type { Proposal } from "~~/services/governance/proposals";

export const DEMO_SIGNERS_ROUTE = "/api/hedera/demo-signers";

export type DemoMemberName = DemoAccountName;

/** A demo member as the browser sees it: everything public, nothing that signs. */
export type DemoMember = {
  name: DemoMemberName;
  accountId: string;
  /** Raw public key in base64, the form `CouncilKey.memberKeys` and `ThresholdProgress.signedBy` use. */
  publicKey: string;
};

/** What `GET` answers. An empty list means the demo signers are not available on this server. */
export type DemoSignersResponse = { members: DemoMember[] };

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

/** The demo members a proposal should offer a button for: none unless anyone may be asked to sign it. */
export function demoMembersToOffer(members: DemoMember[], proposal: Proposal, council: CouncilKey): DemoMember[] {
  if (!canBeSigned(proposal)) return [];
  return members.filter(member => awaitsSignatureFrom(member.publicKey, { ...proposal, council }));
}

export function demoMemberLabel(name: DemoMemberName): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | DemoSignErrorResponse;
  if (!response.ok) {
    const message = (body as DemoSignErrorResponse).error;
    throw new Error(message || `The demo signer answered ${response.status}`);
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
    body: JSON.stringify(request),
  });
  return readJson<DemoSignResponse>(response);
}
