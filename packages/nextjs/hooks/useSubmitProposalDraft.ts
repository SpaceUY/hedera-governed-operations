"use client";

import { useCreateNativeProposal } from "./useCreateNativeProposal";
import { useCreateProposal } from "./useCreateProposal";
import { useMutation } from "@tanstack/react-query";
import type { ProposalDraft } from "~~/services/governance/drafts";
import { PROPOSAL_KIND_COPY } from "~~/services/governance/proposalLabels";

/** One submit for the wizard, whichever path the draft takes. Resolves to the new schedule id. */
export function useSubmitProposalDraft(executorContractId: string) {
  const createRegistryProposal = useCreateProposal();
  const createNativeProposal = useCreateNativeProposal();

  return useMutation({
    mutationFn: async (draft: ProposalDraft): Promise<string> => {
      const memo = PROPOSAL_KIND_COPY[draft.kind].title;

      if (draft.path === "native") {
        const { scheduleId } = await createNativeProposal.mutateAsync({
          innerTransaction: draft.buildInnerTransaction(),
          memo,
        });
        return scheduleId;
      }

      const { scheduleId } = await createRegistryProposal.mutateAsync({
        executorContractId,
        proposal: draft.proposal,
        memo,
      });
      return scheduleId;
    },
  });
}
