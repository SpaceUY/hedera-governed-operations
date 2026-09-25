import { type GenericContract, contracts } from "~~/utils/scaffold-hbar/contract";

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
  const entry = contracts?.[chainId]?.[name];
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

/** The deployment names of the contracts the governance screens read, written once. */
export const GOVERNANCE_CONTRACTS = {
  executor: "GovernedExecutor",
  vault: "AcmeVault",
  /** Deployed but not live: pointing the vault's proxy at it is the upgrade the council approves. */
  vaultNextImplementation: "AcmeVaultV2",
} as const;

export const GOVERNANCE_ROUTES = {
  home: "/",
  newProposal: "/governance/new",
  proposal: (scheduleId: string) => `/governance/${scheduleId}`,
} as const;
