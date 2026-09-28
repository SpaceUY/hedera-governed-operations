"use client";

/**
 * Demo only: see `services/demoSigners/demoSigners.ts` for the feature and the two steps that remove it.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchDemoMembers, requestDemoSignature } from "~~/services/demoSigners/demoSigners";

/** Which demo members this server can sign for. Asked once: it only changes when `yarn setup` runs. */
export function useDemoSigners() {
  return useQuery({ queryKey: ["demo-signers"], queryFn: fetchDemoMembers, staleTime: Infinity, retry: false });
}

/**
 * One demo member's approval, signed on the server. Success only means the network took the
 * transaction: the signature shows once Mirror indexes it, so callers refresh the proposal and
 * render what the next read returns.
 */
export function useDemoSign() {
  return useMutation({ mutationFn: requestDemoSignature });
}
