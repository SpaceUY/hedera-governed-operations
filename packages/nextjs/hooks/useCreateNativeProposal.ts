"use client";

import { useTargetNetwork } from "./scaffold-hbar";
import { useHederaSigner } from "./useHederaSigner";
import type { Transaction } from "@hiero-ledger/sdk";
import { useMutation } from "@tanstack/react-query";
import { getGovernanceEntityIds } from "~~/config/governanceConfig";
import {
  buildProposalSchedule,
  fetchAccountPublicKey,
  scheduleIdFromTransaction,
} from "~~/services/governance/schedules";
import { fetchTransaction } from "~~/services/mirror";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

export type CreateNativeProposalInput = { innerTransaction: Transaction; memo: string };

/** Native operation types (transfer, council rotation): one schedule, no registry entry — fed by
 * `buildTreasuryTransfer`/`buildCouncilRotation` from `services/governance/encode.ts`. */
export function useCreateNativeProposal() {
  const { executeTransaction, requireAccountId } = useHederaSigner();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);

  return useMutation({
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
      const rows = await fetchTransaction(result.transactionId, { network });
      const scheduleId = scheduleIdFromTransaction(rows);
      if (!scheduleId) throw new Error("ScheduleCreate did not leave a SCHEDULECREATE row — check Mirror indexing");
      return { scheduleId };
    },
  });
}
