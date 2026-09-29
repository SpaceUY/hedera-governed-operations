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
 * `toEvmAddress` writes it — for an account, a token or a contract alike. The EVM and the token system
 * contract resolve it to the same entity as any alias the entity may also have, so it is the form to
 * write into calldata when all that is known is a `0.0.x` id.
 */
export function longZeroAddress(entityId: string): `0x${string}` {
  if (!isHederaAccountId(entityId)) throw new Error(`${entityId} is not an entity id of the form shard.realm.num`);
  return `0x${AccountId.fromString(entityId).toEvmAddress()}`;
}
