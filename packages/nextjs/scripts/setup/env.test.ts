import { readSetupEnv } from "./env";
import { describe, expect, it } from "vitest";

const validSource = {
  HEDERA_OPERATOR_ID: "0.0.1234",
  HEDERA_OPERATOR_PRIVATE_KEY: "operator-key",
  HEDERA_COUNCIL_ACCOUNT_ID: "0.0.5678",
};

describe("readSetupEnv", () => {
  it("defaults the network to testnet", () => {
    expect(readSetupEnv(validSource).network).toBe("testnet");
  });

  it("keeps the operator id and private key", () => {
    expect(readSetupEnv(validSource)).toMatchObject({ operatorId: "0.0.1234", operatorPrivateKey: "operator-key" });
  });

  it("keeps the council account id", () => {
    expect(readSetupEnv(validSource).councilAccountId).toBe("0.0.5678");
  });

  it("accepts an explicit testnet in any case", () => {
    expect(readSetupEnv({ ...validSource, HEDERA_NETWORK: "TestNet" }).network).toBe("testnet");
  });

  it("fails when the operator id is missing", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_OPERATOR_ID: undefined })).toThrow("HEDERA_OPERATOR_ID");
  });

  it("fails when the operator private key is missing", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_OPERATOR_PRIVATE_KEY: undefined })).toThrow(
      "HEDERA_OPERATOR_PRIVATE_KEY",
    );
  });

  it("fails when the council account is missing", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_COUNCIL_ACCOUNT_ID: undefined })).toThrow(
      "HEDERA_COUNCIL_ACCOUNT_ID",
    );
  });

  it("explains what the council account is for when it is missing", () => {
    expect(() => readSetupEnv({ ...validSource, HEDERA_COUNCIL_ACCOUNT_ID: undefined })).toThrow(/governance account/);
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
