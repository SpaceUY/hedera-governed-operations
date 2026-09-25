import { PrivateKey } from "@hiero-ledger/sdk";

const VARIABLE = "HEDERA_OPERATOR_PRIVATE_KEY";
const RAW_HEX_KEY = /^[0-9a-fA-F]{64}$/;

/**
 * Parses the operator key as ECDSA. `Client.setOperator(id, string)` goes through `fromStringDer`,
 * which reads a raw 64-char hex key as ED25519, and `fromStringECDSA` turns an ED25519 DER key into an
 * unrelated secp256k1 key; both only surface as `INVALID_SIGNATURE`. Raw hex is taken as ECDSA,
 * anything else must be DER and is checked for its algorithm.
 */
export function parseOperatorKey(value: string): PrivateKey {
  const hex = value.trim().replace(/^0x/, "");
  if (RAW_HEX_KEY.test(hex)) {
    return PrivateKey.fromStringECDSA(hex);
  }

  const key = parseDer(hex);
  if (key.type !== "secp256k1") {
    throw new Error(`${VARIABLE} is an ${key.type} key; the operator must use an ECDSA (secp256k1) key.`);
  }
  return key;
}

function parseDer(hex: string): PrivateKey {
  try {
    return PrivateKey.fromStringDer(hex);
  } catch {
    throw new Error(`${VARIABLE} is neither a 64-char hex ECDSA key nor a DER-encoded private key.`);
  }
}
