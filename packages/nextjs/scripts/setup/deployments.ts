/**
 * What `yarn hardhat:deploy` leaves behind, read from `contracts/deployedContracts.ts`.
 * The setup script never writes that file: the deploys live in the other workspace and run with
 * the deployer key, so the generated record is the only thing the two sides share. Its absence is
 * how setup knows it is being run before the contracts exist.
 *
 * Its presence is not enough, though: the template ships that file with the contracts of its own demo
 * instance, so a fresh scaffold finds a complete record before it has deployed anything. Those
 * contracts answer to another governance account, and building on them would give the new token's
 * keys and the seed proposal to a council this setup does not hold. `readOwnDeployment` asks the
 * executor who it serves before any of it is used.
 */

/**
 * Hedera testnet, the only chain `yarn setup` is allowed to touch. The deploy scripts share the
 * same ids through `packages/hardhat/utils/hederaChains.ts`; this workspace cannot import from
 * there, so the value is repeated here on purpose.
 */
export const HEDERA_TESTNET_CHAIN_ID = 296;

/**
 * Contracts the demo fixtures depend on, and whether the native contract id is needed too:
 * a token key and a scheduled call address a contract by `0.0.x`, not by its EVM address, and
 * only the deploy scripts that resolve it record one.
 */
const REQUIRED_CONTRACTS = {
  GovernedExecutor: "nativeId",
  AcmeVault: "address",
  AcmeVaultV2: "address",
  SaucerSwapAdapter: "address",
  TokenAdmin: "nativeId",
} as const;

type ContractRequirement = (typeof REQUIRED_CONTRACTS)[keyof typeof REQUIRED_CONTRACTS];

type DeployedContract = { address?: string; hederaContractId?: string };

export type DeployedContracts = Record<string | number, Record<string, DeployedContract> | undefined>;

export type GovernanceDeployment = {
  executorEvm: string;
  executorContractId: string;
  /** The proxy, which is what an upgrade proposal targets; the implementation behind it changes. */
  vaultProxyEvm: string;
  vaultV2Evm: string;
  tokenAdminContractId: string;
};

export type DeploymentLookup = { ready: true; deployment: GovernanceDeployment } | { ready: false; missing: string[] };

function isDeployed(contract: DeployedContract | undefined, requirement: ContractRequirement): boolean {
  if (!contract?.address) return false;
  return requirement === "address" || Boolean(contract.hederaContractId);
}

export function readGovernanceDeployment(contracts: DeployedContracts): DeploymentLookup {
  const onChain = contracts[HEDERA_TESTNET_CHAIN_ID] ?? {};
  const missing = Object.entries(REQUIRED_CONTRACTS)
    .filter(([name, requirement]) => !isDeployed(onChain[name], requirement))
    .map(([name]) => name);

  if (missing.length > 0) return { ready: false, missing };

  /** Nothing is missing at this point, so every contract carries what its requirement asked for. */
  const deployed = (name: keyof typeof REQUIRED_CONTRACTS) => onChain[name] as Required<DeployedContract>;

  return {
    ready: true,
    deployment: {
      executorEvm: deployed("GovernedExecutor").address,
      executorContractId: deployed("GovernedExecutor").hederaContractId,
      vaultProxyEvm: deployed("AcmeVault").address,
      vaultV2Evm: deployed("AcmeVaultV2").address,
      tokenAdminContractId: deployed("TokenAdmin").hederaContractId,
    },
  };
}

export type DeploymentLookups = {
  /** Whether the executor at this address grants `EXECUTOR_ROLE` to this governance account. */
  executorServes(executorEvm: string, governanceEvm: string): Promise<boolean>;
};

/** A complete record whose executor answers to another governance account: nothing to build on. */
export type ForeignDeployment = { ready: false; foreignExecutorContractId: string };

export type OwnDeploymentLookup = DeploymentLookup | ForeignDeployment;

/**
 * The deployment recorded in `deployedContracts.ts`, only if it was made for this governance account.
 * The executor is the one contract checked: the vault, the adapter and `TokenAdmin` all take its
 * address in their constructors and are deployed with it.
 */
export async function readOwnDeployment(
  contracts: DeployedContracts,
  governanceEvm: string,
  lookups: DeploymentLookups,
): Promise<OwnDeploymentLookup> {
  const recorded = readGovernanceDeployment(contracts);
  if (!recorded.ready) return recorded;
  const { executorEvm, executorContractId } = recorded.deployment;
  if (await lookups.executorServes(executorEvm, governanceEvm)) return recorded;
  return { ready: false, foreignExecutorContractId: executorContractId };
}
