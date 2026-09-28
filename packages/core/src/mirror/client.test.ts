import notFound from "./__fixtures__/not-found.json";
import page1 from "./__fixtures__/topic-messages-page-1.json";
import page2 from "./__fixtures__/topic-messages-page-2.json";
import {
  MirrorNodeError,
  compareMirrorTimestamps,
  getMirrorBaseUrl,
  mirrorGet,
  mirrorGetAllPages,
  mirrorTimestampToDate,
} from "./client";
import type { TopicMessagesResponse } from "./topics";
import { afterEach, describe, expect, it, vi } from "vitest";

const TESTNET_BASE = "https://testnet.mirrornode.hedera.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getMirrorBaseUrl", () => {
  it("returns the testnet base by default", () => {
    expect(getMirrorBaseUrl()).toBe(TESTNET_BASE);
  });

  it("is case-insensitive on the network name", () => {
    expect(getMirrorBaseUrl("MAINNET")).toBe("https://mainnet.mirrornode.hedera.com");
  });

  it("falls back to testnet for unknown networks", () => {
    expect(getMirrorBaseUrl("localnet")).toBe(TESTNET_BASE);
  });
});

describe("mirrorGet", () => {
  it("prefixes the path with the network base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await mirrorGet("/api/v1/accounts/0.0.1", "testnet");

    expect(fetchMock.mock.calls[0][0]).toBe(`${TESTNET_BASE}/api/v1/accounts/0.0.1`);
  });

  it("throws a MirrorNodeError carrying the status on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(notFound, 404)));

    const error = await mirrorGet("/api/v1/schedules/0.0.1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MirrorNodeError);
    expect((error as MirrorNodeError).status).toBe(404);
  });

  it("keeps the legacy 'Mirror node error <status>' message prefix", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    await expect(mirrorGet("/api/v1/accounts/0.0.1")).rejects.toThrow("Mirror node error 500: boom");
  });
});

describe("mirrorGetAllPages", () => {
  const pickMessages = (page: TopicMessagesResponse) => page.messages;

  it("follows links.next until it is null and concatenates the items", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal("fetch", fetchMock);

    const messages = await mirrorGetAllPages("/api/v1/topics/0.0.10590564/messages?limit=2", pickMessages);

    expect(messages.map(m => m.sequence_number)).toEqual([9, 8, 7, 6]);
  });

  it("requests the next page using the relative links.next path", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal("fetch", fetchMock);

    await mirrorGetAllPages("/api/v1/topics/0.0.10590564/messages?limit=2", pickMessages);

    expect(fetchMock.mock.calls[1][0]).toBe(`${TESTNET_BASE}${page1.links.next}`);
  });

  it("stops at maxPages even when more pages are linked", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(page1)));
    vi.stubGlobal("fetch", fetchMock);

    const messages = await mirrorGetAllPages("/api/v1/topics/0.0.10590564/messages", pickMessages, { maxPages: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(messages).toHaveLength(4);
  });

  it("returns an empty list when the first page has no items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ messages: [], links: { next: null } })));

    await expect(mirrorGetAllPages("/api/v1/topics/0.0.1/messages", pickMessages)).resolves.toEqual([]);
  });
});

describe("mirrorTimestampToDate", () => {
  it("converts seconds.nanos to a Date with millisecond precision", () => {
    expect(mirrorTimestampToDate("1790274893.842000000")?.toISOString()).toBe("2026-09-24T18:34:53.842Z");
  });

  it("returns null for a null timestamp", () => {
    expect(mirrorTimestampToDate(null)).toBeNull();
  });
});

describe("compareMirrorTimestamps", () => {
  it("orders timestamps one nanosecond apart, which a single Number cannot tell apart", () => {
    const earlier = "1790274893.842000001";
    const later = "1790274893.842000002";
    expect(Number(earlier)).toBe(Number(later));
    expect(compareMirrorTimestamps(earlier, later)).toBeLessThan(0);
    expect(compareMirrorTimestamps(later, earlier)).toBeGreaterThan(0);
  });

  it("compares seconds first, and treats short or missing nanos as trailing zeros", () => {
    expect(compareMirrorTimestamps("1790274892.999999999", "1790274893.0")).toBeLessThan(0);
    expect(compareMirrorTimestamps("1790274893.5", "1790274893.500000000")).toBe(0);
    expect(compareMirrorTimestamps("1790274893", "1790274893.000000000")).toBe(0);
  });
});
