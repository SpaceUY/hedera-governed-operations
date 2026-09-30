"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { memberNamesOf } from "~~/components/governance/graph/mapModel";
import { useLatestComposedMap } from "~~/components/governance/graph/useComposedMap";
import type { SeatNaming } from "~~/components/governance/rail/councilSeats";
import { ContractRolesCard } from "~~/components/governance/settings/ContractRolesCard";
import { CouncilCard } from "~~/components/governance/settings/CouncilCard";
import { CouncilChangeComposer } from "~~/components/governance/settings/CouncilChangeComposer";
import { SETTINGS_COPY } from "~~/components/governance/settings/copy";
import { useUnseatedAgent } from "~~/components/governance/settings/useUnseatedAgent";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useRegistryRoles } from "~~/hooks/mirror/useRegistryRoles";
import { useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

/**
 * Settings in the rail, beside the same map: who approves (the treasury account's threshold key), a
 * composer that proposes a change to it, and who may propose (the registry's roles). The governance
 * layout runs the setup guard and provides the config and the draft the composer submits. The page
 * owns the reads and hands the cards plain data, so the council is read once for all of them.
 */
export default function SettingsPage() {
  const config = useGovernanceConfig();
  const { network, governanceAccountId, executor } = config;
  const council = useCouncil({ governanceAccountId, executorContractId: executor.hederaContractId, network });
  const roles = useRegistryRoles({ executorContractId: executor.hederaContractId, network });
  const { composed } = useLatestComposedMap(config);
  const agent = useCoSigningAgent(network);
  const unseatedAgent = useUnseatedAgent(agent, council.data?.key, network);
  const { accountId } = useHederaSigner();
  const memberNames = useMemo(() => (composed ? memberNamesOf(composed) : undefined), [composed]);
  const naming: SeatNaming = {
    proposers: council.data?.proposers ?? [],
    viewerAccountId: accountId ?? null,
    memberNames,
    agent,
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-base-300 px-6 py-4">
        <Link href={GOVERNANCE_ROUTES.home} className="btn btn-outline btn-sm" aria-label={SETTINGS_COPY.backLabel}>
          {SETTINGS_COPY.back}
        </Link>
        <h1 className="m-0 text-base font-bold">{SETTINGS_COPY.heading}</h1>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5 wrap-anywhere">
        <CouncilCard
          council={council.data}
          unreadable={council.isError}
          naming={naming}
          unseatedAgent={unseatedAgent}
        />
        {council.data && (
          <CouncilChangeComposer
            key={`${councilRuleLabel(council.data.key)}:${council.data.key.memberKeys.join(",")}`}
            council={council.data}
            naming={naming}
            config={config}
            unseatedAgent={unseatedAgent}
          />
        )}
        <ContractRolesCard
          roles={roles.data}
          rolesUnreadable={roles.isError}
          council={council.data}
          councilUnreadable={council.isError}
          config={config}
          naming={naming}
        />
      </div>
    </div>
  );
}
