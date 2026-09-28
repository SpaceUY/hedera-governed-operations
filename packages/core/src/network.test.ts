import { parseHederaNetworkName, toHederaNetworkName } from "./network";
import { describe, expect, it } from "vitest";

describe("toHederaNetworkName", () => {
  it("reads either network whatever the casing", () => {
    expect(toHederaNetworkName("MAINNET")).toBe("mainnet");
    expect(toHederaNetworkName("testnet")).toBe("testnet");
  });

  it("answers testnet for a chain it does not recognise, which is what the app wants", () => {
    expect(toHederaNetworkName("previewnet")).toBe("testnet");
  });
});

describe("parseHederaNetworkName", () => {
  it("reads either network whatever the casing or surrounding space", () => {
    expect(parseHederaNetworkName(" Mainnet ", "HEDERA_NETWORK")).toBe("mainnet");
    expect(parseHederaNetworkName("testnet", "HEDERA_NETWORK")).toBe("testnet");
  });

  it("refuses a typo rather than reading it as testnet, and names the variable", () => {
    expect(() => parseHederaNetworkName("mainet", "HEDERA_NETWORK")).toThrow(
      /HEDERA_NETWORK must be testnet or mainnet/,
    );
  });

  it("refuses a network the template does not support", () => {
    expect(() => parseHederaNetworkName("previewnet", "HEDERA_NETWORK")).toThrow(/got "previewnet"/);
  });
});
