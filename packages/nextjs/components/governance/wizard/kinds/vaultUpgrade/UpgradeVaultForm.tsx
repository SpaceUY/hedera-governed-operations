"use client";

import { useEffect, useState } from "react";
import { ReleaseLine } from "./ReleaseLine";
import { VAULT_UPGRADE_COPY } from "./copy";
import { HbarInput } from "@scaffold-hbar-ui/components";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { getReleaseTopicId } from "~~/config/governanceConfig";
import { useVaultImplementation } from "~~/hooks/mirror/useVaultImplementation";
import { type VaultUpgradeTargets, draftVaultUpgrade, tryDraft } from "~~/services/governance/drafts";

export const UpgradeVaultForm = ({
  targets: { proxy, proxyContractId, implementation, implementationAbi },
  network,
  chain,
  onDraftChange,
}: KindFormProps<VaultUpgradeTargets>) => {
  const [withdrawalLimit, setWithdrawalLimit] = useState("");
  const running = useVaultImplementation(proxyContractId, { network });
  const runsImplementation = running.data?.toLowerCase() === implementation.toLowerCase();
  const readingImplementation = running.isLoading;

  // Depends on the fields, not the object: the page rebuilds `targets` every render, while the
  // addresses and the ABI (read from `deployedContracts.ts`) are stable values. A vault already on this
  // implementation is refused: `initV2` is a reinitializer that has run, so the call could only revert and
  // the governance account would pay for it. A slot that could not be read holds nothing back.
  useEffect(() => {
    if (runsImplementation) {
      onDraftChange({ status: "invalid", message: VAULT_UPGRADE_COPY.alreadyRunning });
      return;
    }
    if (readingImplementation || !withdrawalLimit.trim()) {
      onDraftChange({ status: "empty" });
      return;
    }
    onDraftChange(
      tryDraft(() =>
        draftVaultUpgrade({ proxy, proxyContractId, implementation, implementationAbi }, { withdrawalLimit }),
      ),
    );
  }, [
    runsImplementation,
    readingImplementation,
    withdrawalLimit,
    proxy,
    proxyContractId,
    implementation,
    implementationAbi,
    onDraftChange,
  ]);

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
