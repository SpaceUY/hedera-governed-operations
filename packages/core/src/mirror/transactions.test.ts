import transaction from "./__fixtures__/transaction.json";
import { fetchTransaction, normalizeTransactionId } from "./transactions";
import { afterEach, describe, expect, it, vi } from "vitest";

const MIRROR_TX_ID = "0.0.8192684-1789670087-589444591";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeTransactionId", () => {
  it("converts the SDK form 0.0.x@sec.nanos to Mirror's 0.0.x-sec-nanos", () => {
    expect(normalizeTransactionId("0.0.8192684@1789670087.589444591")).toBe(MIRROR_TX_ID);
  });

  it("keeps an id already in Mirror form untouched", () => {
    expect(normalizeTransactionId(MIRROR_TX_ID)).toBe(MIRROR_TX_ID);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTransactionId(`  ${MIRROR_TX_ID}  `)).toBe(MIRROR_TX_ID);
  });

  it("rejects ids without a valid start timestamp", () => {
    expect(() => normalizeTransactionId("0.0.8192684")).toThrow("Invalid transaction ID");
  });

  it("rejects an empty id", () => {
    expect(() => normalizeTransactionId("")).toThrow("Invalid transaction ID");
  });
});

describe("fetchTransaction", () => {
  it("requests /api/v1/transactions/{mirror id} for an SDK-form id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(transaction)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTransaction("0.0.8192684@1789670087.589444591");

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://testnet.mirrornode.hedera.com/api/v1/transactions/${MIRROR_TX_ID}`,
    );
  });

  it("returns every row Mirror records for the id (parent and scheduled child)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(transaction))));

    const rows = await fetchTransaction(MIRROR_TX_ID);

    expect(rows.map(r => [r.name, r.scheduled])).toEqual([
      ["SCHEDULECREATE", false],
      ["CONTRACTCALL", true],
    ]);
  });

  it("does not call fetch when the id is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTransaction("nope")).rejects.toThrow("Invalid transaction ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
