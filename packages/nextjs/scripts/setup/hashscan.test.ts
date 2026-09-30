import { hashScanUrl } from "./hashscan";
import { describe, expect, it } from "vitest";

describe("hashScanUrl", () => {
  it("links an account on testnet", () => {
    expect(hashScanUrl("account", "0.0.1234")).toBe("https://hashscan.io/testnet/account/0.0.1234");
  });

  it("links a token", () => {
    expect(hashScanUrl("token", "0.0.5449")).toBe("https://hashscan.io/testnet/token/0.0.5449");
  });
});
