"use client";

import { useState } from "react";
import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { proposalInboxQueryKey } from "./mirror/useProposals";
import { useTargetNetwork } from "./scaffold-hbar";
import { signedAsOf, signedScheduleIdOf } from "./useRemoteApprovals";
import { useExecuteBeforeDeadline } from "./useWalletRequest";
import { buildScheduleSign } from "@sh/core/governance/schedules";
import { type QueryClient, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { waitForTransactionRow } from "~~/services/governance/transactionRow";
import { type HederaNetworkName, getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

const SCHEDULE_SIGN_ROW = "SCHEDULESIGN";

/**
 * The network refused the signature at consensus: another member's landed first and the proposal ran
 * (`SCHEDULE_ALREADY_EXECUTED`), or this key had signed already (`NO_NEW_VALID_SIGNATURES`).
 */
export class ScheduleSignRefusedError extends Error {
  override readonly name = "ScheduleSignRefusedError";

  constructor(
    readonly scheduleId: string,
    readonly result: string,
  ) {
    super(
      `The network refused the signature on schedule ${scheduleId} (${result}). ` +
        "The proposal may have run on another member's signature, or this key had signed it already.",
    );
  }
}

type SignatureConfirmation = { scheduleId: string; transactionId: string; network: HederaNetworkName };

/**
 * Waits for a `ScheduleSign`'s own Mirror row and throws unless it reads `SUCCESS`, then re-reads the
 * inbox at once, so the map plays the signature as soon as Mirror serves it rather than on the next
 * poll. Shared by the wallet's signature and the demo co-signers'.
 */
export async function confirmSignature(
  queryClient: QueryClient,
  { scheduleId, transactionId, network }: SignatureConfirmation,
): Promise<void> {
  const row = await waitForTransactionRow({ transactionId, name: SCHEDULE_SIGN_ROW, network });
  if (!row) {
    throw new Error(
      `The signature (transaction ${transactionId}) is not on Mirror yet, so it is not confirmed. ` +
        "Wait a moment and look at the proposal before signing again.",
    );
  }
  if (row.result !== "SUCCESS") throw new ScheduleSignRefusedError(scheduleId, row.result);
  await queryClient.refetchQueries({ queryKey: proposalInboxQueryKey(network) });
}

/**
 * One council member's approval. For a rotation this counts toward whichever side (outgoing or
 * incoming) the signer's key belongs to.
 *
 * It succeeds once Mirror lists the signature's own row with `SUCCESS` (`confirmSignature`), with the
 * inbox already re-read. `isConfirming` covers the wait after the wallet has answered, which the rail
 * shows as "Confirming on the network".
 */
export function useSignProposal() {
  const executeTransaction = useExecuteBeforeDeadline();
  const queryClient = useQueryClient();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  const [isConfirming, setIsConfirming] = useState(false);

  const mutation = useMutation({
    mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
    mutationFn: async (scheduleId: string) => {
      const { transactionId } = await executeTransaction(buildScheduleSign(scheduleId));
      setIsConfirming(true);
      try {
        await confirmSignature(queryClient, { scheduleId, transactionId, network });
        return { transactionId };
      } finally {
        setIsConfirming(false);
      }
    },
  });

  return { ...mutation, isConfirming };
}

/**
 * Whether this session has a signature on its way for this schedule — the wallet's or a demo
 * co-signer's — from the press until Mirror lists it. Read from the mutation cache, so it holds
 * wherever the signature was pressed and whether or not that button is still mounted.
 */
export function useSignatureInFlight(scheduleId: string): boolean {
  const signing = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.sign, status: "pending" },
    select: ({ state }) => signedScheduleIdOf(state.variables),
  });
  const signingAs = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.signAs, status: "pending" },
    select: ({ state }) => signedAsOf(state.variables)?.scheduleId,
  });
  return signing.includes(scheduleId) || signingAs.includes(scheduleId);
}
