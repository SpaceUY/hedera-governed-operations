"use client";

import { useState } from "react";
import { proposalInboxQueryKey } from "./mirror/useProposals";
import { useTargetNetwork } from "./scaffold-hbar";
import { useHederaSigner } from "./useHederaSigner";
import { useWalletRequest } from "./useWalletRequest";
import { type RegistryProposal, buildCreateProposalCall } from "@sh/core/governance/encode";
import { proposalIdFromContractResult } from "@sh/core/governance/registry";
import {
  buildExecuteProposalCall,
  buildProposalSchedule,
  fetchAccountPublicKey,
  scheduleIdFromTransaction,
} from "@sh/core/governance/schedules";
import { fetchContractResult, fetchTransaction } from "@sh/core/mirror";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getGovernanceEntityIds } from "~~/config/governanceConfig";
import { type UnscheduledEntry, isEntryFor } from "~~/services/governance/unscheduledEntry";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";
import { MIRROR_INDEXING_RETRY_DELAYS_MS, waitForMirrorIndexing } from "~~/utils/scaffold-hbar/waitForMirrorIndexing";

export type CreateProposalInput = { executorContractId: string; proposal: RegistryProposal; memo: string };

/**
 * Two transactions, neither of which executes anything: `createProposal` registers the call, then
 * a `ScheduleCreate` wraps `execute(id)` for the council to sign. Registering is not approving.
 *
 * When the second fails after the first succeeded, the entry is kept as `unscheduledEntry`, and
 * submitting the same call again only schedules it: registering it twice would leave two entries
 * for one decision. It is kept in this hook's state, so the guarantee holds for the session and not
 * across a reload (see `unscheduledEntry.ts`).
 */
export function useCreateProposal() {
  const { requireAccountId } = useHederaSigner();
  const { walletRequest, lateSubmission, executeStep } = useWalletRequest();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  const queryClient = useQueryClient();
  const [unscheduledEntry, setUnscheduledEntry] = useState<UnscheduledEntry | null>(null);

  const register = async (executorContractId: string, proposal: RegistryProposal): Promise<UnscheduledEntry> => {
    const entryOf = (registrationTransactionId: string): UnscheduledEntry => ({
      executorContractId,
      target: proposal.target,
      calldata: proposal.calldata,
      registrationTransactionId,
      registryProposalId: null,
    });
    // A registration that went through after the deadline is kept too, so a retry only schedules it.
    const { transactionId } = await executeStep(
      buildCreateProposalCall(executorContractId, proposal),
      { action: "register", step: 1, steps: 2 },
      // Never over an entry already kept: that one is what a retry has gone on to schedule.
      late => setUnscheduledEntry(kept => kept ?? entryOf(late.transactionId)),
    );
    const entry = entryOf(transactionId);
    setUnscheduledEntry(entry);
    return entry;
  };

  const readEntryId = async (entry: UnscheduledEntry): Promise<number> => {
    if (entry.registryProposalId !== null) return entry.registryProposalId;
    let reverted = false;
    // `proposalIdFromContractResult` throws if the registration actually reverted, which ends the
    // polling at once; null (or a 404) means only that Mirror has not indexed it yet.
    const registryProposalId = await waitForMirrorIndexing(async () => {
      const result = await fetchContractResult(entry.registrationTransactionId, { network });
      reverted = Boolean(result.error_message);
      return proposalIdFromContractResult(result);
    }, MIRROR_INDEXING_RETRY_DELAYS_MS).catch(error => {
      // A reverted registration left no entry: the next attempt has to register again.
      if (reverted) setUnscheduledEntry(null);
      throw error;
    });
    if (registryProposalId == null) {
      throw new Error(
        `createProposal (transaction ${entry.registrationTransactionId}) is not yet indexed on Mirror after polling. ` +
          "Its entry is registered: submitting the same proposal again reads its id and schedules it, without registering it twice.",
      );
    }
    setUnscheduledEntry({ ...entry, registryProposalId });
    return registryProposalId;
  };

  const mutation = useMutation({
    mutationFn: async ({ executorContractId, proposal, memo }: CreateProposalInput) => {
      const proposerId = requireAccountId();

      const resumed = isEntryFor(unscheduledEntry, executorContractId, proposal);
      const entry = resumed ? unscheduledEntry : await register(executorContractId, proposal);
      const registryProposalId = await readEntryId(entry);

      const adminKey = await fetchAccountPublicKey(proposerId, network);
      const scheduleResult = await executeStep(
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
        resumed ? { action: "schedule", step: 1, steps: 1 } : { action: "schedule", step: 2, steps: 2 },
        // Scheduled after the deadline after all: a second schedule on the entry would only revert.
        () => setUnscheduledEntry(null),
      );
      // Scheduled: a second schedule on the same entry would revert and bill the treasury once the first ran.
      setUnscheduledEntry(null);

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

  return { ...mutation, unscheduledEntry, walletRequest, lateSubmission };
}
