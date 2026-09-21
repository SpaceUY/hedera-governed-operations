import page1 from "./__fixtures__/topic-messages-page-1.json";
import { decodeBase64Utf8, decodeTopicMessage, fetchDecodedTopicMessages, fetchTopicMessages } from "./topics";
import { afterEach, describe, expect, it, vi } from "vitest";

const RECORDED_JSON_MESSAGE = page1.messages[0];

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeBase64Utf8", () => {
  it("decodes multi-byte UTF-8 characters", () => {
    expect(decodeBase64Utf8(base64("héllo ✓"))).toBe("héllo ✓");
  });

  it("decodes an empty payload to an empty string", () => {
    expect(decodeBase64Utf8("")).toBe("");
  });
});

describe("decodeTopicMessage", () => {
  it("exposes the decoded text of a recorded message", () => {
    expect(decodeTopicMessage(RECORDED_JSON_MESSAGE).text).toContain('"schema":"poc-receipt/1"');
  });

  it("parses a JSON payload", () => {
    expect(decodeTopicMessage(RECORDED_JSON_MESSAGE).json).toMatchObject({ kind: "D4-allowance" });
  });

  it("leaves json undefined for a non-JSON payload", () => {
    const decoded = decodeTopicMessage({ ...RECORDED_JSON_MESSAGE, message: base64("plain text proof") });

    expect(decoded.json).toBeUndefined();
  });

  it("keeps the text of a non-JSON payload", () => {
    const decoded = decodeTopicMessage({ ...RECORDED_JSON_MESSAGE, message: base64("plain text proof") });

    expect(decoded.text).toBe("plain text proof");
  });

  it("does not throw on invalid base64 and yields empty text", () => {
    expect(decodeTopicMessage({ ...RECORDED_JSON_MESSAGE, message: "%%%not-base64%%%" }).text).toBe("");
  });

  it("preserves the original Mirror fields", () => {
    expect(decodeTopicMessage(RECORDED_JSON_MESSAGE).sequence_number).toBe(9);
  });
});

describe("fetchTopicMessages", () => {
  it("rejects a malformed topic id before hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTopicMessages("topic")).rejects.toThrow("Invalid topic ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clamps the limit to Mirror's maximum of 100", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page1)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTopicMessages("0.0.10590564", { limit: 500 });

    expect(fetchMock.mock.calls[0][0]).toContain("limit=100");
  });

  it("normalizes a missing links field to { next: null }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [] }))));

    await expect(fetchTopicMessages("0.0.10590564")).resolves.toEqual({ messages: [], links: { next: null } });
  });
});

describe("fetchDecodedTopicMessages", () => {
  it("returns the page messages already decoded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(page1))));

    const messages = await fetchDecodedTopicMessages("0.0.10590564");

    expect(messages.map(m => (m.json as { kind: string }).kind)).toEqual(["D4-allowance", "D3-swap"]);
  });
});
