import { TokenAdminForm } from "./TokenAdminForm";
import { TOKEN_ADMIN_COPY } from "./copy";
import { PauseIcon } from "@heroicons/react/24/outline";
import { defineWizardKind } from "~~/components/governance/wizard/kinds/wizardKind";
import { GOVERNANCE_CONTRACTS, findDeployedContract } from "~~/config/governanceConfig";
import type { TokenAdminTargets } from "~~/services/governance/drafts";

/** Acts through `TokenAdmin`, which holds the keys of the token the setup created. */
export const TOKEN_ADMIN_KIND = defineWizardKind<TokenAdminTargets>({
  icon: PauseIcon,
  resolveTargets: ({ config, chain }) => {
    const tokenAdmin = findDeployedContract(chain.id, GOVERNANCE_CONTRACTS.tokenAdmin);
    if (!tokenAdmin) return { status: "unavailable", notice: TOKEN_ADMIN_COPY.contractMissing };
    return {
      status: "available",
      targets: {
        tokenAdmin: tokenAdmin.address,
        tokenAdminContractId: tokenAdmin.hederaContractId,
        tokenId: config.demoTokenId,
      },
    };
  },
  Form: TokenAdminForm,
});
