import {
  TransactionExpiredError,
  WALLET_REJECTED_MESSAGE,
  WalletRequestExpiredError,
  isInsufficientGasError,
  isWalletRejection,
  validityWindowLabel,
} from "~~/services/web3/hederaSigner";

const INSUFFICIENT_GAS_MESSAGE =
  "The call ran out of gas. The network charged the full fee even though nothing changed — retrying is safe, it will not charge twice.";

const transactionExpiredMessage = (validForSeconds: number) =>
  "The approval took too long and the transaction expired. This transaction was not sent. " +
  `Try again and approve it in the wallet within ${validityWindowLabel(validForSeconds)}.`;

const walletRequestExpiredMessage = (validForSeconds: number) =>
  "The request expired before it was approved. This transaction was not sent. " +
  `Reject it in HashPack, then try again and approve within ${validityWindowLabel(validForSeconds)}.`;

const toFriendlyMessage = (error: unknown) => {
  if (isWalletRejection(error)) return WALLET_REJECTED_MESSAGE;
  if (error instanceof WalletRequestExpiredError) return walletRequestExpiredMessage(error.validForSeconds);
  if (error instanceof TransactionExpiredError) return transactionExpiredMessage(error.validForSeconds);
  if (isInsufficientGasError(error)) return INSUFFICIENT_GAS_MESSAGE;
  return `Transaction failed: ${error instanceof Error ? error.message : "unknown error"}`;
};

export const MutationError = ({ error }: { error: unknown }) =>
  error ? (
    <p role="alert" className="text-sm text-error">
      {toFriendlyMessage(error)}
    </p>
  ) : null;
