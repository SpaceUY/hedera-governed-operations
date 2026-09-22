/**
 * One proposal left pending, so a freshly installed template opens on something to approve rather
 * than on an empty registry: the harness CHAIN stage has a proposal to read and the demo has a
 * vote to run. It is the vault upgrade, which is the operation this direction exists to show.
 *
 * Only the proposal is seeded, not the scheduled transaction that approves it. A schedule expires
 * after seven days, and collecting its signatures is exactly the step the person installing the
 * template is meant to perform; a proposal itself never expires, so a seed left untouched for a
 * month is still there, still pending, still approvable.
 */
import type { GovernanceDeployment } from "./deployments";
import type { SetupStep } from "./reconcile";
import type { SeedProposal, SetupState } from "./state";
import { encodeFunctionData, parseAbi } from "viem";

/**
 * Registering a proposal stores the calldata the council will approve, and Hedera charges for that
 * storage by the byte: the upgrade's hundred bytes do not fit the 200,000 a bare selector needs.
 */
export const SEED_PROPOSAL_GAS = 300_000;

const UPGRADE_ABI = parseAbi(["function upgradeToAndCall(address newImplementation, bytes data)"]);

export type SeedProposalLookups = {
  /** True once the executor has logged the proposal as executed or cancelled. */
  proposalSettled(executorContractId: string, proposalId: number): Promise<boolean>;
  /** Executor the deployed vault accepts an upgrade from, read from the proxy's own storage. */
  vaultExecutor(vaultProxyEvm: string): Promise<string>;
};

export type SeedProposalActions = {
  createProposal(executorContractId: string, targetEvm: string, calldata: string): Promise<number>;
};

export type SeedProposalServices = {
  lookups: SeedProposalLookups;
  actions: SeedProposalActions;
};

export type SeedProposalResult = {
  seedProposal: SeedProposal;
  step: SetupStep;
};

const labelFor = (id: number) => `Seed proposal #${id} (upgrade AcmeVault to AcmeVaultV2)`;

/** Points the proxy at the next implementation, with no initializer call behind it. */
export function seedProposalCalldata(implementationEvm: string): string {
  return encodeFunctionData({
    abi: UPGRADE_ABI,
    functionName: "upgradeToAndCall",
    args: [implementationEvm as `0x${string}`, "0x"],
  });
}

/**
 * The vault fixes its executor in `initialize` and has no setter, so a redeployed `GovernedExecutor`
 * leaves the proxy trusting the old one. Everything else recovers by itself — `TokenAdmin` and the
 * swap adapter take the executor in their constructor, so a deploy recreates them against the
 * current one — which is what makes this the one binding worth reading back from the chain.
 */
function requireSameExecutor(vaultProxyEvm: string, trusted: string, executorEvm: string): void {
  if (trusted.toLowerCase() === executorEvm.toLowerCase()) return;
  throw new Error(
    `The vault at ${vaultProxyEvm} accepts upgrades from ${trusted}, and the GovernedExecutor deployed now is ` +
      `${executorEvm}. The executor is fixed when the proxy is initialized and has no setter, so this proposal ` +
      "would be approved by the council and then revert with NotExecutor, spending the schedule for nothing. " +
      "Redeploy the vault against the current executor: delete packages/hardhat/deployments/hederaTestnet/AcmeVault*.json " +
      "and run yarn hardhat:deploy --network hederaTestnet again.",
  );
}

/** A proposal id is an index into one registry, so it means nothing against a different executor. */
async function isPending(
  existing: SeedProposal | undefined,
  executorContractId: string,
  lookups: SeedProposalLookups,
): Promise<boolean> {
  if (!existing || existing.executorContractId !== executorContractId) return false;
  return !(await lookups.proposalSettled(executorContractId, existing.id));
}

export async function reconcileSeedProposal(
  state: SetupState,
  deployment: GovernanceDeployment,
  services: SeedProposalServices,
): Promise<SeedProposalResult> {
  const { executorContractId, executorEvm, vaultProxyEvm, vaultV2Evm } = deployment;
  const existing = state.seedProposal;

  requireSameExecutor(vaultProxyEvm, await services.lookups.vaultExecutor(vaultProxyEvm), executorEvm);

  if (await isPending(existing, executorContractId, services.lookups)) {
    const pending = existing as SeedProposal;
    return { seedProposal: pending, step: { label: labelFor(pending.id), outcome: "reused" } };
  }

  const id = await services.actions.createProposal(executorContractId, vaultProxyEvm, seedProposalCalldata(vaultV2Evm));
  return { seedProposal: { id, executorContractId }, step: { label: labelFor(id), outcome: "created" } };
}
