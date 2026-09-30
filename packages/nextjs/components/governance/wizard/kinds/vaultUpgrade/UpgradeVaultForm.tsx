"use client";

import { useEffect, useState } from "react";
import { ReleaseLine } from "./ReleaseLine";
import { HbarInput } from "@scaffold-hbar-ui/components";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { getReleaseTopicId } from "~~/config/governanceConfig";
import { type VaultUpgradeTargets, draftVaultUpgrade, tryDraft } from "~~/services/governance/drafts";

export const UpgradeVaultForm = ({
  targets: { proxy, proxyContractId, implementation, implementationAbi },
  network,
  chain,
  onDraftChange,
}: KindFormProps<VaultUpgradeTargets>) => {
  const [withdrawalLimit, setWithdrawalLimit] = useState("");

  // Depends on the fields, not the object: the page rebuilds `targets` every render, while the
  // addresses and the ABI (read from `deployedContracts.ts`) are stable values.
  useEffect(() => {
    if (!withdrawalLimit.trim()) {
      onDraftChange({ status: "empty" });
      return;
    }
    onDraftChange(
      tryDraft(() =>
        draftVaultUpgrade({ proxy, proxyContractId, implementation, implementationAbi }, { withdrawalLimit }),
      ),
    );
  }, [withdrawalLimit, proxy, proxyContractId, implementation, implementationAbi, onDraftChange]);

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">v2 implementation address</span>
          <input className="input w-full bg-base-300 font-mono text-sm" value={implementation} readOnly />
        </label>
        <ReleaseLine implementation={implementation} topicId={getReleaseTopicId()} network={network} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Withdrawal limit per transaction (ℏ)</span>
        <HbarInput chain={chain} onValueChange={({ valueInNative }) => setWithdrawalLimit(valueInNative)} />
      </label>
      <p className="m-0 text-sm text-base-content/60 leading-normal">
        v2 adds withdrawals, capped at this amount. The cap is set in the same call the council approves, so the vault
        never runs v2 without one.
      </p>
    </div>
  );
};
