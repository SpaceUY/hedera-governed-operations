import { TransferForm } from "./TransferForm";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import type { TreasuryTransferTargets } from "~~/services/governance/drafts";

/** A native transfer out of the treasury: no contract, so nothing can be missing. */
export const TREASURY_TRANSFER_KIND = defineWizardKind<TreasuryTransferTargets>({
  icon: ArrowRightIcon,
  resolveTargets: ({ config }) => ({
    status: "available",
    targets: { governanceAccountId: config.governanceAccountId },
  }),
  Form: TransferForm,
});
