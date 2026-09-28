import { TreasurySwapForm } from "./TreasurySwapForm";
import { TREASURY_SWAP_COPY } from "./copy";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import { GOVERNANCE_CONTRACTS, findDeployedContract } from "~~/config/governanceConfig";
import type { TreasurySwapTargets } from "~~/services/governance/drafts";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap";

/** Sells treasury HBAR for the DEX configuration's USDC through `SaucerSwapAdapter`, paid out to the treasury. */
export const TREASURY_SWAP_KIND = defineWizardKind<TreasurySwapTargets>({
  icon: ArrowsRightLeftIcon,
  resolveTargets: ({ config, chain }) => {
    const adapter = findDeployedContract(chain.id, GOVERNANCE_CONTRACTS.swapAdapter);
    if (!adapter) return { status: "unavailable", notice: TREASURY_SWAP_COPY.adapterMissing };
    const dex = SAUCERSWAP_V2_CONFIG[config.network];
    return {
      status: "available",
      targets: {
        adapter: adapter.address,
        adapterContractId: adapter.hederaContractId,
        governanceAccountId: config.governanceAccountId,
        tokenOutId: dex.usdcToken,
        fee: dex.defaultFee,
      },
    };
  },
  Form: TreasurySwapForm,
});
