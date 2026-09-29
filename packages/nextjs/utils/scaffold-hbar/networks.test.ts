import { getHashScanUrl } from "./networks";
import { describe, expect, it } from "vitest";

describe("getHashScanUrl", () => {
  it("links an entity on the network's own explorer", () => {
    expect(getHashScanUrl("testnet", "schedule", "0.0.10765804")).toBe(
      "https://hashscan.io/testnet/schedule/0.0.10765804",
    );
    expect(getHashScanUrl("mainnet", "transaction", "1727500000.000000001")).toBe(
      "https://hashscan.io/mainnet/transaction/1727500000.000000001",
    );
  });
});
