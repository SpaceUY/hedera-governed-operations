"use client";

/**
 * Demo only: see `services/demoSigners/demoSigners.ts` for the feature and the two steps that remove it.
 */
import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useTargetNetwork } from "./scaffold-hbar";
import { signedAsOf } from "./useRemoteApprovals";
import { confirmSignature } from "./useSignProposal";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DemoSignRequest,
  type DemoSignResponse,
  fetchDemoMembers,
  requestDemoSignature,
} from "~~/services/demoSigners/demoSigners";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

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
 * One demo member's approval, signed on the server. Like the wallet's signature, it succeeds once
 * Mirror lists the `ScheduleSign` with `SUCCESS`, with the inbox already re-read (`confirmSignature`),
 * so the map plays it as soon as it can be read.
 */
export function useDemoSign() {
  const queryClient = useQueryClient();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  return useMutation<DemoSignResponse, Error, DemoSignVariables>({
    mutationKey: GOVERNANCE_MUTATION_KEYS.signAs,
    mutationFn: async ({ scheduleId, member }) => {
      const response = await requestDemoSignature({ scheduleId, member });
      await confirmSignature(queryClient, { scheduleId, transactionId: response.transactionId, network });
      return response;
    },
  });
}

/** A demo signature for this schedule is on its way: with the server, or waiting for Mirror to list it. */
export function useDemoSignaturePending(scheduleId: string): boolean {
  const pending = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.signAs, status: "pending" },
    select: ({ state }) => signedAsOf(state.variables)?.scheduleId,
  });
  return pending.includes(scheduleId);
}

export type DemoSignatureState = "none" | "sending" | "sent";

/**
 * Where a demo signature for this schedule and seat stands in this session: `sending` while the server
 * has the request or Mirror does not list it yet, `sent` once Mirror does, `none` if it was never sent
 * or failed. Read from the mutation cache so it survives the button being unmounted and mounted
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
