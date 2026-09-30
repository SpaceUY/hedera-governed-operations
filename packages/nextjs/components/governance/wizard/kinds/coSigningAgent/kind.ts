import { AddAgentForm, type CoSigningAgentTargets } from "./AddAgentForm";
import { CO_SIGNING_AGENT_COPY } from "./copy";
import { PlusIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";

/**
 * Seats the co-signing agent by rewriting the governance account's own threshold key: no contract, so
 * nothing can be missing. The kind does not read the configured agent account yet, so the form starts
 * empty; `suggestedAgentAccountId` is where it would go.
 */
export const CO_SIGNING_AGENT_KIND = defineWizardKind<CoSigningAgentTargets>({
  icon: PlusIcon,
  title: CO_SIGNING_AGENT_COPY.title,
  hint: CO_SIGNING_AGENT_COPY.pickerHint,
  resolveTargets: ({ config }) => ({
    status: "available",
    targets: { config, suggestedAgentAccountId: null },
  }),
  Form: AddAgentForm,
});
