import { type GenericContract, contracts } from "~~/utils/scaffold-hbar/contract";
import { type HederaNetworkName, getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

export type GovernanceEntityIds = {
  governanceAccountId: string;
  demoTokenId: string;
  seedProposalId: number;
};

/**
 * Each variable is read with a literal `process.env.NEXT_PUBLIC_*` member expression: Next.js only
 * inlines those into the client bundle, so a computed lookup is always `undefined` in the browser.
 */
export function getGovernanceEntityIds(): GovernanceEntityIds {
  const governanceAccountId = process.env.NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID;
  const demoTokenId = process.env.NEXT_PUBLIC_DEMO_TOKEN_ID;
  const seedProposalId = process.env.NEXT_PUBLIC_SEED_PROPOSAL_ID;
  if (!governanceAccountId || !demoTokenId || !seedProposalId) {
    throw new Error(
      "Missing NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID, NEXT_PUBLIC_DEMO_TOKEN_ID or NEXT_PUBLIC_SEED_PROPOSAL_ID. " +
        "Run `yarn setup` or set them in .env.local.",
    );
  }

  const parsedSeedProposalId = Number(seedProposalId);
  if (!Number.isInteger(parsedSeedProposalId)) {
    throw new Error(`NEXT_PUBLIC_SEED_PROPOSAL_ID must be an integer, got "${seedProposalId}". Run \`yarn setup\`.`);
  }

  return { governanceAccountId, demoTokenId, seedProposalId: parsedSeedProposalId };
}

/** A deployed contract as the governance screens need it: with the native id a scheduled call targets. */
export type HederaDeployedContract = GenericContract & { hederaContractId: string };

export function getDeployedContract(chainId: number, name: string): HederaDeployedContract {
  const entry = findDeployment(chainId, name);
  if (!entry) {
    throw new Error(
      `${name} is not deployed on chain ${chainId}. Run \`yarn hardhat:deploy --network hederaTestnet\`.`,
    );
  }
  if (!entry.hederaContractId) {
    throw new Error(
      `${name} on chain ${chainId} has no Hedera contract id. Re-run \`yarn hardhat:deploy --network hederaTestnet\`.`,
    );
  }
  return { ...entry, hederaContractId: entry.hederaContractId };
}

/**
 * A deployment as it was recorded, with or without its native id: enough for a screen that can name a
 * contract by its EVM address, such as the map drawing one the deploy has not resolved an id for.
 */
export function findDeployment(chainId: number, name: string): GenericContract | null {
  return contracts?.[chainId]?.[name] ?? null;
}

/** `getDeployedContract` for a contract a screen can do without: null where that one would throw. */
export function findDeployedContract(chainId: number, name: string): HederaDeployedContract | null {
  try {
    return getDeployedContract(chainId, name);
  } catch {
    return null;
  }
}

/** The deployment names of the contracts the governance screens read, written once. */
export const GOVERNANCE_CONTRACTS = {
  executor: "GovernedExecutor",
  vault: "AcmeVault",
  /**
   * Deployed but not live: pointing the vault's proxy at it is the upgrade the council approves.
   * Only the wizard's upgrade form needs it, so it is not part of `resolveGovernanceConfig`.
   */
  vaultNextImplementation: "AcmeVaultV2",
  /**
   * Holds the token's pause and freeze keys. Only the map and the wizard's token form need it, so it
   * is not part of the guard.
   */
  tokenAdmin: "TokenAdmin",
  /** Sells treasury HBAR on SaucerSwap; only the map needs it, so it is not part of the guard. */
  swapAdapter: "SaucerSwapAdapter",
} as const;

export type GovernanceConfig = GovernanceEntityIds & {
  network: HederaNetworkName;
  executor: HederaDeployedContract;
  vault: HederaDeployedContract;
};

/**
 * Everything a governance screen reads before it can render, resolved in one place. Throws the
 * message `SetupNotice` shows when `yarn setup` or the deploy has not run for this chain.
 */
export function resolveGovernanceConfig(chainId: number): GovernanceConfig {
  return {
    ...getGovernanceEntityIds(),
    network: getHederaNetworkNameFromChainId(chainId),
    executor: getDeployedContract(chainId, GOVERNANCE_CONTRACTS.executor),
    vault: getDeployedContract(chainId, GOVERNANCE_CONTRACTS.vault),
  };
}

export const GOVERNANCE_ROUTES = {
  home: "/",
  newProposal: "/governance/new",
  proposal: (scheduleId: string) => `/governance/${scheduleId}`,
} as const;
