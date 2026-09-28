"use client";

import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { proposalInboxQueryKey } from "./mirror/useProposals";
import { useTargetNetwork } from "./scaffold-hbar";
import { useHederaSigner } from "./useHederaSigner";
import type { Transaction } from "@hiero-ledger/sdk";
import { buildProposalSchedule, fetchAccountPublicKey, scheduleIdFromTransaction } from "@sh/core/governance/schedules";
import { fetchTransaction } from "@sh/core/mirror";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getGovernanceEntityIds } from "~~/config/governanceConfig";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";
import { MIRROR_INDEXING_RETRY_DELAYS_MS, waitForMirrorIndexing } from "~~/utils/scaffold-hbar/waitForMirrorIndexing";

export type CreateNativeProposalInput = { innerTransaction: Transaction; memo: string };

/** Native operation types (transfer, council rotation): one schedule, no registry entry — fed by
 * `buildTreasuryTransfer`/`buildCouncilRotation` from `services/governance/encode.ts`. */
export function useCreateNativeProposal() {
  const { executeTransaction, requireAccountId } = useHederaSigner();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: GOVERNANCE_MUTATION_KEYS.openNative,
    mutationFn: async ({ innerTransaction, memo }: CreateNativeProposalInput) => {
      const proposerId = requireAccountId();
      const adminKey = await fetchAccountPublicKey(proposerId, network);

      const result = await executeTransaction(
        buildProposalSchedule({
          innerTransaction,
          governanceAccountId: getGovernanceEntityIds().governanceAccountId,
          adminKey,
          memo,
        }),
      );
      const scheduleId = await waitForMirrorIndexing(
        async () => scheduleIdFromTransaction(await fetchTransaction(result.transactionId, { network })),
        MIRROR_INDEXING_RETRY_DELAYS_MS,
      );
      if (!scheduleId) {
        throw new Error(
          `The schedule (transaction ${result.transactionId}) is not yet indexed on Mirror after polling. ` +
            "Read its schedule id from that transaction rather than scheduling again.",
        );
      }
      return { scheduleId };
    },
    // Owned by the mutation rather than each caller, so the inbox refreshes even when the screen that
    // submitted has unmounted, instead of waiting out the slow poll of a settled inbox.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: proposalInboxQueryKey(network) }),
  });
}
