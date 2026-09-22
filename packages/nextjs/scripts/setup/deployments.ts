/**
 * What `yarn hardhat:deploy` leaves behind, read from `contracts/deployedContracts.ts`.
 * The setup script never writes that file: the deploys live in the other workspace and run with
 * the deployer key, so the generated record is the only thing the two sides share. Its absence is
 * how setup knows it is being run before the contracts exist.
 */

/** Hedera testnet, the only chain `yarn setup` is allowed to touch. */
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
