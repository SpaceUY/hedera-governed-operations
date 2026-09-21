/**
 * Base64 encoding for transactions exchanged with the wallet
 * (`hedera_signAndExecuteTransaction`, `hedera_signTransaction`).
 * Use the package entry point only — avoids deep imports under dist/ that can break on upgrades.
 */
export { base64StringToTransaction, transactionToBase64String } from "@hashgraph/hedera-wallet-connect";
