import type { ProposalDraft } from "./draft";
import { encodeUpgrade } from "@sh/core/governance/encode";
import { type Abi, type Address, encodeFunctionData } from "viem";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

export type VaultUpgradeTargets = {
  proxy: Address;
  proxyContractId: string;
  implementation: Address;
  implementationAbi: Abi;
};

export type VaultUpgradeValues = { withdrawalLimit: string };

/**
 * `initV2` is a reinitializer anyone can call once the proxy runs v2 code, so the upgrade has to run
 * it in the same transaction the council approves. An upgrade without it would leave the cap for the
 * first caller to set, and a cap of zero would refuse every withdrawal.
 */
export function draftVaultUpgrade(targets: VaultUpgradeTargets, values: VaultUpgradeValues): ProposalDraft {
  if (!values.withdrawalLimit.trim()) throw new Error("Set the withdrawal limit the upgrade will apply");

  const limitTinybars = parseAmount(values.withdrawalLimit, HBAR_DECIMALS);
  if (limitTinybars === 0n) throw new Error("A withdrawal limit of zero would refuse every withdrawal");

  const initializerCalldata = encodeFunctionData({
    abi: targets.implementationAbi,
    functionName: "initV2",
    args: [limitTinybars],
  } as const);
  return {
    path: "registry",
    kind: "upgrade",
    target: `Vault · ${targets.proxyContractId}`,
    proposal: encodeUpgrade({ proxy: targets.proxy, implementation: targets.implementation, initializerCalldata }),
  };
}
