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
import { MIRROR_INDEXING_RETRY_DELAYS_MS, waitForMirrorIndexing } from "~~/utils/scaffold-hbar/waitForMirrorIndexing";

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
  });
}
