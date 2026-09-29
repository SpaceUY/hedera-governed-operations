import { SwapForm, type SwapFormTargets } from "./SwapForm";
import { TREASURY_SWAP_COPY } from "./copy";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import { GOVERNANCE_CONTRACTS, findDeployment } from "~~/config/governanceConfig";

/**
 * Sells treasury HBAR through `SaucerSwapAdapter`. The calldata only needs the adapter's address, so a
 * deployment the deploy recorded without a native id is still usable; it is then named by its address.
 */
export const TREASURY_SWAP_KIND = defineWizardKind<SwapFormTargets>({
  icon: ArrowsRightLeftIcon,
  resolveTargets: ({ config, chain }) => {
    const adapter = findDeployment(chain.id, GOVERNANCE_CONTRACTS.swapAdapter);
    if (!adapter) return { status: "unavailable", notice: TREASURY_SWAP_COPY.adapterMissing };
    return {
      status: "available",
      targets: {
        adapter: adapter.address,
        adapterLabel: adapter.hederaContractId ?? adapter.address,
        governanceAccountId: config.governanceAccountId,
      },
    };
  },
  Form: SwapForm,
});
