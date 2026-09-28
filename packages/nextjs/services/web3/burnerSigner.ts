import type { ExecutedTransaction } from "./hederaSigner";
import type { HederaSigner } from "./hederaSignerPort";
import { type Client, PrivateKey, type PublicKey, type Transaction } from "@hiero-ledger/sdk";
import { fetchAccount, isMirrorNotFound } from "@sh/core/mirror";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * Same key the Hedera Harness CHAIN stage writes before reloading the app
 * (`chainValidation.expose.browserLocalStorageKey`), following the burner-wallet
 * pattern of the harness's x402 recipe (github.com/hedera-dev/hedera-harness).
 */
export const BURNER_PRIVATE_KEY_STORAGE_KEY = "burnerWallet.pk";

/** Mirror can take a few seconds to index an account created just before the page loaded. */
const ACCOUNT_LOOKUP_RETRY_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000];

const HEX_PREFIX = /^0x/i;

export class BurnerKeyError extends Error {
  override readonly name = "BurnerKeyError";

  constructor(message = `The value stored under "${BURNER_PRIVATE_KEY_STORAGE_KEY}" is not a valid ECDSA private key`) {
    super(message);
  }
}

/** Reads the injected key; the raw value never appears in errors or logs. */
export function readBurnerPrivateKey(storage: Pick<Storage, "getItem">): PrivateKey | null {
  const stored = storage.getItem(BURNER_PRIVATE_KEY_STORAGE_KEY)?.trim();
  if (!stored) return null;
  try {
    return PrivateKey.fromStringECDSA(stored.replace(HEX_PREFIX, ""));
  } catch {
    throw new BurnerKeyError();
  }
}

type AccountLookupOptions = { retryDelaysMs?: readonly number[] };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Resolves the `0.0.x` id of the account created with this key as its EVM alias. */
export async function resolveBurnerAccountId(
  publicKey: PublicKey,
  network: HederaNetworkName,
  { retryDelaysMs = ACCOUNT_LOOKUP_RETRY_DELAYS_MS }: AccountLookupOptions = {},
): Promise<string> {
  const evmAddress = `0x${publicKey.toEvmAddress()}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const account = await fetchAccount(evmAddress, { network });
      return account.account;
    } catch (error) {
      const canRetry = isMirrorNotFound(error) && attempt < retryDelaysMs.length;
      if (!canRetry && isMirrorNotFound(error)) {
        throw new Error(`Test signer account ${evmAddress} not found on ${network}: fund it and reload`);
      }
      if (!canRetry) throw error;
      await sleep(retryDelaysMs[attempt]);
    }
  }
}

export type BurnerSignerOptions = {
  privateKey: PrivateKey;
  accountId: string;
  network: HederaNetworkName;
  /** Network client the signer takes over: the burner becomes its operator and pays for every transaction. */
  client: Client;
};

/**
 * `publicKey` is the extension point for demo modes that need the ephemeral account on-chain
 * beyond paying: e.g. adding it as a member of a threshold key. A payer-only flow needs nothing
 * more than the HBAR the harness funds it with (`chainValidation.fundingHbar`).
 */
export type BurnerSigner = HederaSigner & { kind: "burner"; publicKey: PublicKey };

export function createBurnerSigner({ privateKey, accountId, network, client }: BurnerSignerOptions): BurnerSigner {
  client.setOperator(accountId, privateKey);

  const freeze = <T extends Transaction>(tx: T): T => (tx.isFrozen() ? tx : tx.freezeWith(client));

  const executeTransaction = async (tx: Transaction): Promise<ExecutedTransaction> => {
    const response = await freeze(tx).execute(client);
    await response.getReceipt(client);
    return { transactionId: response.transactionId.toString() };
  };

  const signTransaction = <T extends Transaction>(tx: T): Promise<T> => freeze(tx).sign(privateKey);

  return { kind: "burner", accountId, network, publicKey: privateKey.publicKey, executeTransaction, signTransaction };
}
