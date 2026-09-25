"use client";

import { useTargetNetwork } from "./scaffold-hbar";
import { useHederaSigner } from "./useHederaSigner";
import { useMutation } from "@tanstack/react-query";
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

export type CreateProposalInput = { executorContractId: string; proposal: RegistryProposal; memo: string };

/**
 * Two transactions, neither of which executes anything: `createProposal` registers the call, then
 * a `ScheduleCreate` wraps `execute(id)` for the council to sign. Registering is not approving.
 */
export function useCreateProposal() {
  const { executeTransaction, requireAccountId } = useHederaSigner();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);

  return useMutation({
    mutationFn: async ({ executorContractId, proposal, memo }: CreateProposalInput) => {
      const proposerId = requireAccountId();

      const createResult = await executeTransaction(buildCreateProposalCall(executorContractId, proposal));
      const contractResult = await fetchContractResult(createResult.transactionId, { network });
      // `proposalIdFromContractResult` itself throws if the registration actually reverted; null
      // here means only that Mirror has not indexed the return value yet.
      const registryProposalId = proposalIdFromContractResult(contractResult);
      if (registryProposalId == null) {
        throw new Error("createProposal's result is not yet indexed on Mirror — poll again before retrying");
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
      const rows = await fetchTransaction(scheduleResult.transactionId, { network });
      const scheduleId = scheduleIdFromTransaction(rows);
      if (!scheduleId) {
        throw new Error("ScheduleCreate did not leave a SCHEDULECREATE row — check Mirror indexing");
      }

      return { registryProposalId, scheduleId };
    },
  });
}
