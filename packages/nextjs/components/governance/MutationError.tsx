import { WALLET_REJECTED_MESSAGE, isWalletRejection } from "~~/services/web3/hederaSigner";

const toFriendlyMessage = (error: unknown) =>
  isWalletRejection(error)
    ? WALLET_REJECTED_MESSAGE
    : `Transaction failed: ${error instanceof Error ? error.message : "unknown error"}`;

export const MutationError = ({ error }: { error: unknown }) =>
  error ? (
    <p role="alert" className="text-sm text-error">
      {toFriendlyMessage(error)}
    </p>
  ) : null;
