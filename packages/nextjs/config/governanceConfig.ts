import { type GenericContract, contracts } from "~~/utils/scaffold-hbar/contract";
import { type HederaNetworkName, getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

export type GovernanceEntityIds = {
  governanceAccountId: string;
  demoTokenId: string;
  seedProposalId: number;
};

/**
 * The public testnet instance this template is published with: the ids `yarn setup` wrote for the
 * contracts committed in `contracts/deployedContracts.ts`. A fresh clone reads it until `yarn setup`
 * writes its own ids, so the screens show real data before anything is configured. Ids only, no keys.
 */
export const DEMO_INSTANCE = {
  governanceAccountId: "0.0.10671146",
  demoTokenId: "0.0.10671171",
  seedProposalId: 0,
  releaseTopicId: "0.0.10760100",
  coSigningAgentAccountId: "0.0.10671144",
} as const;

/**
 * Each variable is read with a literal `process.env.NEXT_PUBLIC_*` member expression: Next.js only
 * inlines those into the client bundle, so a computed lookup is always `undefined` in the browser.
 */
function readGovernanceEnv() {
  return {
    governanceAccountId: process.env.NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID,
    demoTokenId: process.env.NEXT_PUBLIC_DEMO_TOKEN_ID,
    seedProposalId: process.env.NEXT_PUBLIC_SEED_PROPOSAL_ID,
  };
}

/**
 * True when none of the ids `yarn setup` writes is set, so the app reads `DEMO_INSTANCE`. Some but
 * not all of them is not the demo: it is a setup that stopped halfway, and it is reported as such.
 */
export function isDemoInstance(): boolean {
  return Object.values(readGovernanceEnv()).every(value => !value);
}

export function getGovernanceEntityIds(): GovernanceEntityIds {
  if (isDemoInstance()) {
    const { governanceAccountId, demoTokenId, seedProposalId } = DEMO_INSTANCE;
    return { governanceAccountId, demoTokenId, seedProposalId };
  }

  const { governanceAccountId, demoTokenId, seedProposalId } = readGovernanceEnv();
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

/**
 * The HCS topic `yarn setup` creates for release manifests, or null when none is configured. Optional:
 * only the upgrade form reads it, to say whether a release vouches for the implementation.
 */
export function getReleaseTopicId(): string | null {
  const configured = process.env.NEXT_PUBLIC_RELEASE_TOPIC_ID?.trim();
  if (configured) return configured;
  return isDemoInstance() ? DEMO_INSTANCE.releaseTopicId : null;
}

/**
 * The co-signing agent's account (`packages/agent`), when the app is told which one it runs as: an
 * account id, public like every other id here. Optional — without it the council list names no agent.
 */
export function getCoSigningAgentAccountId(): string | null {
  const configured = process.env.NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID?.trim();
  if (configured) return configured;
  return isDemoInstance() ? DEMO_INSTANCE.coSigningAgentAccountId : null;
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
  /** The code the vault's proxy was deployed with, under the name hardhat-deploy records it by. */
  vaultFirstImplementation: "AcmeVault_Implementation",
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
