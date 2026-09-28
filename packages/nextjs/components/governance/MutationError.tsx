import { WALLET_REJECTED_MESSAGE, isInsufficientGasError, isWalletRejection } from "~~/services/web3/hederaSigner";

const INSUFFICIENT_GAS_MESSAGE =
  "The call ran out of gas. The network charged the full fee even though nothing changed — retrying is safe, it will not charge twice.";

const toFriendlyMessage = (error: unknown) => {
  if (isWalletRejection(error)) return WALLET_REJECTED_MESSAGE;
  if (isInsufficientGasError(error)) return INSUFFICIENT_GAS_MESSAGE;
  return `Transaction failed: ${error instanceof Error ? error.message : "unknown error"}`;
};

export const MutationError = ({ error }: { error: unknown }) =>
  error ? (
    <p role="alert" className="text-sm text-error">
      {toFriendlyMessage(error)}
    </p>
  ) : null;
