"use client";

import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { WIZARD_KINDS, type WizardKind } from "./OperationTypePicker";
import type { MutationStatus } from "@tanstack/react-query";
import { useSubmitProposalDraft } from "~~/hooks/useSubmitProposalDraft";
import { type DraftPreview, type DraftResult, previewDraft } from "~~/services/governance/drafts";

export type ProposalWizardState = {
  kind: WizardKind;
  chooseKind: (kind: WizardKind) => void;
  draft: DraftResult;
  setDraft: (result: DraftResult) => void;
  /** What the council will be shown for the current draft; null until the form holds one. */
  preview: DraftPreview | null;
  /** "pending" while the wallet signs and Mirror indexes the schedule, "success" once it has. */
  submitStatus: MutationStatus;
  submitError: Error | null;
  submit: () => void;
};

const EMPTY_DRAFT: DraftResult = { status: "empty" };

const ProposalWizardContext = createContext<ProposalWizardState | null>(null);

type ProposalWizardProviderProps = {
  executorContractId: string;
  /** Called with the new schedule id once the proposal is opened and indexed, if the provider is still mounted. */
  onSubmitted: (scheduleId: string) => void;
  children: ReactNode;
};

/**
 * Owns the wizard's kind, draft and submit above the wizard itself, so a panel can close while the
 * wallet is still signing without dropping the submission, and so something beside the wizard (a
 * map drawing the draft) can read what is being proposed. The submit is exposed only through
 * `submit`, so no consumer can start one that skips `onSubmitted`.
 */
export const ProposalWizardProvider = ({ executorContractId, onSubmitted, children }: ProposalWizardProviderProps) => {
  const { mutate, reset, status, error } = useSubmitProposalDraft(executorContractId);
  const [kind, setKind] = useState<WizardKind>(WIZARD_KINDS[0]);
  const [draft, setDraft] = useState<DraftResult>(EMPTY_DRAFT);

  const preview = useMemo(() => (draft.status === "ready" ? previewDraft(draft.draft) : null), [draft]);

  const chooseKind = useCallback(
    (next: WizardKind) => {
      setKind(next);
      setDraft(EMPTY_DRAFT);
      reset();
    },
    [reset],
  );

  const submit = useCallback(() => {
    if (draft.status !== "ready") return;
    mutate(draft.draft, {
      // The provider outlives the wizard's route, so a finished submission is cleared once handed
      // over: the next proposal starts from an empty draft and an idle submit.
      onSuccess: scheduleId => {
        onSubmitted(scheduleId);
        setDraft(EMPTY_DRAFT);
        reset();
      },
    });
  }, [draft, mutate, reset, onSubmitted]);

  // Memoised so a re-render of the host alone does not re-render every consumer, such as a map.
  const value = useMemo(
    () => ({ kind, chooseKind, draft, setDraft, preview, submitStatus: status, submitError: error, submit }),
    [kind, chooseKind, draft, preview, status, error, submit],
  );

  return <ProposalWizardContext.Provider value={value}>{children}</ProposalWizardContext.Provider>;
};

export function useProposalWizard(): ProposalWizardState {
  const state = useContext(ProposalWizardContext);
  if (!state) throw new Error("useProposalWizard must be used inside a ProposalWizardProvider");
  return state;
}
