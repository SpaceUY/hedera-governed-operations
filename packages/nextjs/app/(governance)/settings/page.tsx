"use client";

import Link from "next/link";
import { SETTINGS_COPY } from "~~/components/governance/settings/copy";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";

/**
 * Settings in the rail, beside the same map: who approves (the treasury account's threshold key), a
 * composer that proposes a change to it, and who may propose (the registry's roles). The governance
 * layout runs the setup guard and provides the config and the draft the composer submits.
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-base-300 px-6 py-4">
        <Link href={GOVERNANCE_ROUTES.home} className="btn btn-outline btn-sm" aria-label={SETTINGS_COPY.backLabel}>
          {SETTINGS_COPY.back}
        </Link>
        <h1 className="m-0 text-base font-bold">{SETTINGS_COPY.heading}</h1>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5 wrap-anywhere" />
    </div>
  );
}
