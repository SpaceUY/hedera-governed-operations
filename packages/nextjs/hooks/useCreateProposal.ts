"use client";

import { proposalInboxQueryKey } from "./mirror/useProposals";
import { useTargetNetwork } from "./scaffold-hbar";
import { useHederaSigner } from "./useHederaSigner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getGovernanceEntityIds } from "~~/config/governanceConfig";
import { type RegistryProposal, buildCreateProposalCall } from "~~/services/governance/encode";
import { proposalIdFromContractResult } from "~~/services/governance/registry";
import {
  buildExecuteProposalCall,
  buildProposalSchedule,
  fetchAccountPublicKey,
  scheduleIdFromTransaction,
} from "~~/services/governance/schedules";
import { fetchContractResult, fetchTransaction } from "~~/services/mirror";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";
import { MIRROR_INDEXING_RETRY_DELAYS_MS, waitForMirrorIndexing } from "~~/utils/scaffold-hbar/waitForMirrorIndexing";

export type CreateProposalInput = { executorContractId: string; proposal: RegistryProposal; memo: string };

/**
 * Two transactions, neither of which executes anything: `createProposal` registers the call, then
 * a `ScheduleCreate` wraps `execute(id)` for the council to sign. Registering is not approving.
 */
export function useCreateProposal() {
  const { executeTransaction, requireAccountId } = useHederaSigner();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ executorContractId, proposal, memo }: CreateProposalInput) => {
      const proposerId = requireAccountId();

      const createResult = await executeTransaction(buildCreateProposalCall(executorContractId, proposal));
      // `proposalIdFromContractResult` itself throws if the registration actually reverted, which
      // ends the polling at once; null (or a 404) means only that Mirror has not indexed it yet.
      const registryProposalId = await waitForMirrorIndexing(
        async () => proposalIdFromContractResult(await fetchContractResult(createResult.transactionId, { network })),
        MIRROR_INDEXING_RETRY_DELAYS_MS,
      );
      if (registryProposalId == null) {
        // The registration is on chain: calling createProposal again would register a duplicate.
        throw new Error(
          `createProposal (transaction ${createResult.transactionId}) is not yet indexed on Mirror after polling. ` +
            "Its entry is registered: read the id from that transaction and schedule it, do not register it again.",
        );
      }

      const adminKey = await fetchAccountPublicKey(proposerId, network);
      const scheduleResult = await executeTransaction(
        buildProposalSchedule({
          innerTransaction: buildExecuteProposalCall({
            executorContractId,
            proposalId: registryProposalId,
            gas: proposal.executeGas,
            payableTinybars: proposal.payableTinybars,
          }),
          governanceAccountId: getGovernanceEntityIds().governanceAccountId,
          adminKey,
          memo,
        }),
      );
      const scheduleId = await waitForMirrorIndexing(
        async () => scheduleIdFromTransaction(await fetchTransaction(scheduleResult.transactionId, { network })),
        MIRROR_INDEXING_RETRY_DELAYS_MS,
      );
      if (!scheduleId) {
        throw new Error(
          `The schedule for registry entry ${registryProposalId} (transaction ${scheduleResult.transactionId}) ` +
            "is not yet indexed on Mirror after polling. Read its schedule id from that transaction rather than scheduling again.",
        );
      }

      return { registryProposalId, scheduleId };
    },
    // Owned by the mutation rather than each caller, so the inbox refreshes even when the screen that
    // submitted has unmounted, instead of waiting out the slow poll of a settled inbox.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: proposalInboxQueryKey(network) }),
  });
}
