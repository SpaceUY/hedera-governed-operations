import { AddAgentForm, type CoSigningAgentTargets } from "./AddAgentForm";
import { CO_SIGNING_AGENT_COPY } from "./copy";
import { PlusIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import { getCoSigningAgentAccountId } from "~~/config/governanceConfig";

/**
 * Seats the co-signing agent by rewriting the governance account's own threshold key: no contract, so
 * nothing can be missing. The form starts from the agent the app is told about
 * (`NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID`), and still checks it like any typed account (`agentSeatOf`).
 */
export const CO_SIGNING_AGENT_KIND = defineWizardKind<CoSigningAgentTargets>({
  icon: PlusIcon,
  title: CO_SIGNING_AGENT_COPY.title,
  hint: CO_SIGNING_AGENT_COPY.pickerHint,
  resolveTargets: ({ config }) => ({
    status: "available",
    targets: { config, suggestedAgentAccountId: getCoSigningAgentAccountId() },
  }),
  Form: AddAgentForm,
});
