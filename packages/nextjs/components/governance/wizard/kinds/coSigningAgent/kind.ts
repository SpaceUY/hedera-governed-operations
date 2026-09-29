import { AddAgentForm, type CoSigningAgentTargets } from "./AddAgentForm";
import { CO_SIGNING_AGENT_COPY } from "./copy";
import { PlusIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";

/**
 * Seats the co-signing agent by rewriting the governance account's own threshold key: no contract, so
 * nothing can be missing. The configuration names no agent account today, so the form starts empty;
 * once it does, `suggestedAgentAccountId` is where it goes.
 */
export const CO_SIGNING_AGENT_KIND = defineWizardKind<CoSigningAgentTargets>({
  icon: PlusIcon,
  hint: CO_SIGNING_AGENT_COPY.pickerHint,
  resolveTargets: ({ config }) => ({
    status: "available",
    targets: { config, suggestedAgentAccountId: null },
  }),
  Form: AddAgentForm,
});
