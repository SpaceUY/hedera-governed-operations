import { ContractId } from "@hiero-ledger/sdk";
import { fetchAccount } from "@sh/core/mirror";
import { createRelayClient } from "@sh/core/relayClient";
import { type Address, parseAbi } from "viem";

const ACME_VAULT_ABI = parseAbi(["function totalDeposits() view returns (uint256)"]);

export type TreasuryFigures = {
  hbarBalanceTinybar: number;
  acmeBalance: number;
  usdcBalance: number;
  /** A `uint256` read from the vault, kept as a bigint so a large reserve is not rounded. */
  vaultReserveTinybar: bigint;
};

export type FetchTreasuryFiguresOptions = {
  governanceAccountId: string;
  vaultContractId: string;
  demoTokenId: string;
  usdcTokenId: string;
  rpcUrl: string;
  network?: string;
};

function tokenBalance(tokens: { token_id: string; balance: number }[], tokenId: string): number {
  return tokens.find(token => token.token_id === tokenId)?.balance ?? 0;
}

/** The vault's reserve is `AcmeVault.totalDeposits` (a running total, not the proxy's own tinybar
 * balance) so an upgrade to v2 that allows withdrawals keeps reporting the right figure. */
export async function fetchTreasuryFigures({
  governanceAccountId,
  vaultContractId,
  demoTokenId,
  usdcTokenId,
  rpcUrl,
  network,
}: FetchTreasuryFiguresOptions): Promise<TreasuryFigures> {
  const [account, vaultReserve] = await Promise.all([
    fetchAccount(governanceAccountId, { network }),
    createRelayClient(rpcUrl).readContract({
      address: `0x${ContractId.fromString(vaultContractId).toEvmAddress()}` as Address,
      abi: ACME_VAULT_ABI,
      functionName: "totalDeposits",
    }),
  ]);

  return {
    hbarBalanceTinybar: account.balance.balance,
    acmeBalance: tokenBalance(account.balance.tokens, demoTokenId),
    usdcBalance: tokenBalance(account.balance.tokens, usdcTokenId),
    vaultReserveTinybar: vaultReserve,
  };
}
