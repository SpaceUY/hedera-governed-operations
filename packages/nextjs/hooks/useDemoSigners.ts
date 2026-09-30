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

/** Which demo members this server can sign for. Asked once: it only changes when `yarn setup` runs. */
export function useDemoSigners() {
  return useQuery({ queryKey: DEMO_SIGNERS_QUERY_KEY, queryFn: fetchDemoMembers, staleTime: Infinity, retry: false });
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

/**
 * Whether a demo signature for this schedule and seat was already sent from this session and has not
 * failed, read from the mutation cache so it survives the button being unmounted and mounted again
 * (another proposal opened and closed again) while Mirror has yet to list the signature.
 */
export function useDemoSignatureSent(scheduleId: string, memberKey: string): boolean {
  const sent = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.signAs },
    select: ({ state }) => (state.status === "error" ? null : (signedAsOf(state.variables) ?? null)),
  });
  return sent.some(own => own?.scheduleId === scheduleId && own.memberKey === memberKey);
}
