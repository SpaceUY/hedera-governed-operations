"use client";

/**
 * Demo only: see `services/demoSigners/demoSigners.ts` for the feature and the two steps that remove it.
 */
import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { signedAsOf } from "./useRemoteApprovals";
import { useMutation, useMutationState, useQuery } from "@tanstack/react-query";
import {
  type DemoSignRequest,
  type DemoSignResponse,
  fetchDemoMembers,
  requestDemoSignature,
} from "~~/services/demoSigners/demoSigners";

export const DEMO_SIGNERS_QUERY_KEY = ["demo", "signers"] as const;

/**
 * How long an answer of nobody stands. The server reads its keys and its co-signing agent at boot, so
 * a developer who fixes either and comes back to the tab should not need a reload to see the buttons.
 */
const NOBODY_STALE_MS = 30_000;

/**
 * Which demo members this server can sign for. A list with members is asked once: it only changes when
 * `yarn setup` runs. An empty one goes stale, so the next focus or opened proposal asks again.
 */
export function useDemoSigners() {
  return useQuery({
    queryKey: DEMO_SIGNERS_QUERY_KEY,
    queryFn: fetchDemoMembers,
    staleTime: query => (query.state.data?.length ? Infinity : NOBODY_STALE_MS),
    retry: false,
  });
}

/**
 * What a demo signature is called with: the request, plus the member's key, so the signature banner
 * can tell this screen's approval from one sent elsewhere as soon as the mutation starts. The key is
 * not sent; the server derives it from the member's private key.
 */
export type DemoSignVariables = DemoSignRequest & { memberKey: string };

/**
 * One demo member's approval, signed on the server. Success only means the network took the
 * transaction: the signature shows once Mirror indexes it, so callers refresh the proposal and render
 * what the next read returns.
 */
export function useDemoSign() {
  return useMutation<DemoSignResponse, Error, DemoSignVariables>({
    mutationKey: GOVERNANCE_MUTATION_KEYS.signAs,
    mutationFn: ({ scheduleId, member }) => requestDemoSignature({ scheduleId, member }),
  });
}

export type DemoSignatureState = "none" | "sending" | "sent";

/**
 * Where a demo signature for this schedule and seat stands in this session: `sending` while the server
 * has the request, `sent` once the network took it (Mirror may not list it yet), `none` if it was never
 * sent or failed. Read from the mutation cache so it survives the button being unmounted and mounted
 * again (another proposal opened and closed again).
 */
export function useDemoSignatureState(scheduleId: string, memberKey: string): DemoSignatureState {
  const statuses = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.signAs },
    select: ({ state }) => {
      const own = signedAsOf(state.variables);
      return own?.scheduleId === scheduleId && own.memberKey === memberKey ? state.status : null;
    },
  });
  if (statuses.includes("pending")) return "sending";
  return statuses.includes("success") ? "sent" : "none";
}
