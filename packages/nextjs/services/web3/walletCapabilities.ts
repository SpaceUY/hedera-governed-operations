import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";

/** The name the connected wallet reports in its WalletConnect session, or null without a session. */
export function walletNameOf(session: HederaProvider["session"]): string | null {
  return session?.peer.metadata.name || null;
}

/**
 * Wallets known to refuse a `ScheduleDelete`. HashPack (iOS app and desktop extension) answers it with
 * "Unsupported Transaction Type" through both `hedera_signAndExecuteTransaction` and
 * `hedera_signTransaction`, and the dapp only receives a plain `USER_REJECT`, so the refusal cannot be
 * told apart from a person pressing Reject. Verified on testnet on 2026-09-29; Kabila signs the same
 * transaction. Remove the entry once HashPack supports the type.
 *
 * Matched as a lowercase substring of the name the wallet reports in its WalletConnect session metadata,
 * because that name is self-reported and its exact spelling ("HashPack", "HashPack Wallet", …) is not
 * part of any contract.
 */
export const WALLETS_WITHOUT_SCHEDULE_DELETE = ["hashpack"] as const;

/**
 * Whether the connected wallet can sign a `ScheduleDelete`. An unknown wallet, or none (the test signer,
 * or nothing connected), counts as able to: a notice is only worth showing when the refusal is known.
 */
export function signsScheduleDelete(walletName: string | null): boolean {
  if (!walletName) return true;
  const normalized = walletName.trim().toLowerCase();
  return !WALLETS_WITHOUT_SCHEDULE_DELETE.some(wallet => normalized.includes(wallet));
}
