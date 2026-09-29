import { UpgradeVaultForm } from "./UpgradeVaultForm";
import { VAULT_UPGRADE_COPY } from "./copy";
import { ArrowUpIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import { GOVERNANCE_CONTRACTS, findDeployedContract } from "~~/config/governanceConfig";
import type { VaultUpgradeTargets } from "~~/services/governance/drafts";

/** Points the vault's proxy at `AcmeVaultV2`, which the guard does not require, so it is looked up here. */
export const VAULT_UPGRADE_KIND = defineWizardKind<VaultUpgradeTargets>({
  icon: ArrowUpIcon,
  resolveTargets: ({ config, chain }) => {
    const next = findDeployedContract(chain.id, GOVERNANCE_CONTRACTS.vaultNextImplementation);
    if (!next) return { status: "unavailable", notice: VAULT_UPGRADE_COPY.targetMissing };
    return {
      status: "available",
      targets: {
        proxy: config.vault.address,
        proxyContractId: config.vault.hederaContractId,
        implementation: next.address,
        implementationAbi: next.abi,
      },
    };
  },
  Form: UpgradeVaultForm,
});
