import { type GenericContract, contracts } from "~~/utils/scaffold-hbar/contract";

export type GovernanceEntityIds = {
  governanceAccountId: string;
  demoTokenId: string;
  seedProposalId: number;
};

function requireEnv(name: string): string {
  const value = process.env[`NEXT_PUBLIC_${name}`];
  if (!value) throw new Error(`Missing NEXT_PUBLIC_${name}. Run \`yarn setup\` or set it in .env.local.`);
  return value;
}

export function getGovernanceEntityIds(): GovernanceEntityIds {
  return {
    governanceAccountId: requireEnv("GOVERNANCE_ACCOUNT_ID"),
    demoTokenId: requireEnv("DEMO_TOKEN_ID"),
    seedProposalId: Number(requireEnv("SEED_PROPOSAL_ID")),
  };
}

export function getDeployedContract(chainId: number, name: string): GenericContract {
  const entry = contracts?.[chainId]?.[name];
  if (!entry) {
    throw new Error(
      `${name} is not deployed on chain ${chainId}. Run \`yarn hardhat:deploy --network hederaTestnet\`.`,
    );
  }
  return entry;
}
