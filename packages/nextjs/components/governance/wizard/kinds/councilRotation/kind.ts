import { CouncilRotationForm } from "./CouncilRotationForm";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import type { CouncilRotationTargets } from "~~/services/governance/drafts";

/** Rewrites the governance account's own threshold key: no contract, so nothing can be missing. */
export const COUNCIL_ROTATION_KIND = defineWizardKind<CouncilRotationTargets>({
  icon: UserGroupIcon,
  resolveTargets: ({ config }) => ({
    status: "available",
    targets: { governanceAccountId: config.governanceAccountId },
  }),
  Form: CouncilRotationForm,
});
