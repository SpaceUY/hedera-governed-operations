const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT_ID_REGEX = /^\d+\.\d+\.\d+$/;

export function isEvmAddress(value: string | null | undefined): value is `0x${string}` {
  return Boolean(value && EVM_ADDRESS_REGEX.test(value));
}

export function isHederaAccountId(value: string | null | undefined): value is string {
  return Boolean(value && HEDERA_ACCOUNT_ID_REGEX.test(value));
}
