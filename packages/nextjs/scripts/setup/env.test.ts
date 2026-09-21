import { readSetupEnv } from "./env";
import { describe, expect, it } from "vitest";

const validSource = {
  HEDERA_OPERATOR_ID: "0.0.1234",
  HEDERA_OPERATOR_PRIVATE_KEY: "operator-key",
};

describe("readSetupEnv", () => {
  it("defaults the network to testnet", () => {
    expect(readSetupEnv(validSource).network).toBe("testnet");
  });

  it("keeps the operator id and private key", () => {
    expect(readSetupEnv(validSource)).toMatchObject({ operatorId: "0.0.1234", operatorPrivateKey: "operator-key" });
  });

  it("accepts an explicit testnet in any case", () => {
    expect(readSetupEnv({ ...validSource, HEDERA_NETWORK: "TestNet" }).network).toBe("testnet");
  });

  it("fails when the operator id is missing", () => {
    expect(() => readSetupEnv({ HEDERA_OPERATOR_PRIVATE_KEY: "operator-key" })).toThrow("HEDERA_OPERATOR_ID");
  });

  it("fails when the operator private key is missing", () => {
    expect(() => readSetupEnv({ HEDERA_OPERATOR_ID: "0.0.1234" })).toThrow("HEDERA_OPERATOR_PRIVATE_KEY");
  });

  it("treats a blank value as missing", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_OPERATOR_ID: "   " })).toThrow("HEDERA_OPERATOR_ID");
  });

  it("refuses mainnet", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_NETWORK: "mainnet" })).toThrow(/mainnet/);
  });

  it("refuses unknown networks", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_NETWORK: "localnet" })).toThrow(/HEDERA_NETWORK/);
  });
});
