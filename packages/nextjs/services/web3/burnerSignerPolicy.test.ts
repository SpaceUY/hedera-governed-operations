import { resolveBurnerAvailability } from "./burnerSignerPolicy";
import { describe, expect, it } from "vitest";

describe("resolveBurnerAvailability", () => {
  it("allows the burner on testnet outside production", () => {
    expect(resolveBurnerAvailability({ network: "testnet", nodeEnv: "development", enableFlag: undefined })).toEqual({
      allowed: true,
    });
  });

  it("allows the burner on testnet in production when the flag opts in", () => {
    expect(resolveBurnerAvailability({ network: "testnet", nodeEnv: "production", enableFlag: "true" })).toEqual({
      allowed: true,
    });
  });

  it("blocks the burner in production without the flag", () => {
    expect(resolveBurnerAvailability({ network: "testnet", nodeEnv: "production", enableFlag: undefined })).toEqual({
      allowed: false,
      reason: 'NEXT_PUBLIC_ENABLE_BURNER_SIGNER is not "true" in a production build',
    });
  });

  it("blocks the burner on mainnet even when the flag opts in", () => {
    expect(resolveBurnerAvailability({ network: "mainnet", nodeEnv: "development", enableFlag: "true" })).toEqual({
      allowed: false,
      reason: "the test signer only runs on testnet",
    });
  });

  it('treats any flag value other than "true" as opt-out', () => {
    expect(resolveBurnerAvailability({ network: "testnet", nodeEnv: "production", enableFlag: "1" })).toMatchObject({
      allowed: false,
    });
  });
});
