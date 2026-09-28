"use client";

import { type ReactNode, useMemo } from "react";
import { SetupNotice } from "~~/components/SetupNotice";
import { GovernanceProvider } from "~~/components/governance/GovernanceProvider";
import { TreasuryStrip } from "~~/components/governance/TreasuryStrip";
import { GovernanceMap } from "~~/components/governance/graph/GovernanceMap";
import { decorateDemoMap } from "~~/components/governance/graph/demo/demoGraph";
import { type GovernanceConfig, resolveGovernanceConfig } from "~~/config/governanceConfig";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { LIVE_MAP_STATUS_NOTE } from "~~/services/governance/proposalLabels";

type ResolvedConfig = { config: GovernanceConfig } | { error: unknown };

function tryResolveGovernanceConfig(chainId: number): ResolvedConfig {
  try {
    return { config: resolveGovernanceConfig(chainId) };
  } catch (error) {
    return { error };
  }
}

/**
 * The live map: `/`, `/governance/[scheduleId]` and `/governance/new` share it, so the map stays
 * mounted while the rail changes route. Below the header it is one fold on a wide screen — the map
 * pane never scrolls and the rail scrolls on its own — and the two stack on a phone.
 *
 * The setup guard runs here, once, for every governance route; a page reads the result with
 * `useGovernanceConfig()`.
 */
export default function GovernanceLayout({ children }: { children: ReactNode }) {
  const { targetNetwork } = useTargetNetwork();
  // Memoised so the config, and the context carrying it, keep their identity across renders.
  const resolved = useMemo(() => tryResolveGovernanceConfig(targetNetwork.id), [targetNetwork.id]);
  if ("error" in resolved) return <SetupNotice error={resolved.error} />;

  return (
    <GovernanceProvider config={resolved.config}>
      <div className="flex flex-col lg:min-h-0 lg:grow lg:basis-0 lg:flex-row">
        <section aria-label="Live map" className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <TreasuryStrip />
          <p className="m-0 px-6 py-3 text-sm text-base-content/70">{LIVE_MAP_STATUS_NOTE}</p>
          <div className="relative flex min-h-64 flex-1 flex-col p-6 pt-0 lg:min-h-0">
            <div className="min-h-0 flex-1">
              <GovernanceMap config={resolved.config} decorate={decorateDemoMap} />
            </div>
          </div>
        </section>
        <div className="flex min-w-0 flex-col border-t border-base-300 lg:w-2/5 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          {children}
        </div>
      </div>
    </GovernanceProvider>
  );
}
