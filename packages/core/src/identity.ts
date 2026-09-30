import { AccountId } from "@hiero-ledger/sdk";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_REGEX = /^\d+\.\d+\.\d+$/;

export function isEvmAddress(value: string | null | undefined): value is `0x${string}` {
  return Boolean(value && EVM_ADDRESS_REGEX.test(value));
}

export function isHederaAccountId(value: string | null | undefined): value is string {
  return Boolean(value && HEDERA_ACCOUNT_ID_REGEX.test(value));
}

/**
 * The EVM address an entity answers to by its number alone — the "long-zero" form, as the SDK's
 * `toEvmAddress` writes it — for an account, a token or a contract alike. It is not interchangeable
 * with an alias: the token system contract refuses the long-zero address of an account that has an
 * EVM alias (`INVALID_ACCOUNT_ID`, measured on testnet on a freeze), so an account goes into calldata
 * as the address the Mirror Node reports for it (`evm_address`), and this form is for tokens,
 * contracts and accounts known to have no alias.
 */
export function longZeroAddress(entityId: string): `0x${string}` {
  if (!isHederaAccountId(entityId)) throw new Error(`${entityId} is not an entity id of the form shard.realm.num`);
  return `0x${AccountId.fromString(entityId).toEvmAddress()}`;
}
