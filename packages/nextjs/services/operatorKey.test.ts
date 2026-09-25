// @vitest-environment node
import { parseOperatorKey } from "./operatorKey";
import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";

describe("parseOperatorKey", () => {
  const ecdsa = PrivateKey.generateECDSA();
  const expectedPublicKey = ecdsa.publicKey.toStringRaw();

  it("reads a raw hex key as ECDSA", () => {
    expect(parseOperatorKey(ecdsa.toStringRaw()).publicKey.toStringRaw()).toBe(expectedPublicKey);
  });

  it("accepts a 0x prefix on a raw hex key", () => {
    expect(parseOperatorKey(`0x${ecdsa.toStringRaw()}`).publicKey.toStringRaw()).toBe(expectedPublicKey);
  });

  it("reads a DER-encoded ECDSA key", () => {
    expect(parseOperatorKey(ecdsa.toStringDer()).publicKey.toStringRaw()).toBe(expectedPublicKey);
  });

  it("rejects a DER-encoded ED25519 key, naming the variable", () => {
    const ed25519 = PrivateKey.generateED25519();
    expect(() => parseOperatorKey(ed25519.toStringDer())).toThrow(/HEDERA_OPERATOR_PRIVATE_KEY/);
  });

  it("rejects a value that is not a key, naming the variable", () => {
    expect(() => parseOperatorKey("not-a-key")).toThrow(/HEDERA_OPERATOR_PRIVATE_KEY/);
  });
});
