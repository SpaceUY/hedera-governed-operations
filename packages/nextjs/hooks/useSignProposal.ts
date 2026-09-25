"use client";

import { useHederaSigner } from "./useHederaSigner";
import { buildScheduleSign } from "@sh/core/governance/schedules";
import { useMutation } from "@tanstack/react-query";

/** One council member's approval. For a rotation this counts toward whichever side (outgoing or
 * incoming) the signer's key belongs to. */
export function useSignProposal() {
  const { executeTransaction } = useHederaSigner();
  return useMutation({ mutationFn: (scheduleId: string) => executeTransaction(buildScheduleSign(scheduleId)) });
}
