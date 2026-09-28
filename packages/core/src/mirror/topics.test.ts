import page1 from "./__fixtures__/topic-messages-page-1.json";
import {
  decodeBase64Utf8,
  decodeTopicMessage,
  fetchDecodedTopicMessagePages,
  fetchDecodedTopicMessages,
  fetchTopic,
  fetchTopicMessages,
  hasSubmitKey,
} from "./topics";
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

describe("fetchDecodedTopicMessagePages", () => {
  const pageOf = (messages: unknown[], next: string | null) =>
    new Response(JSON.stringify({ messages, links: { next } }));

  it("follows links.next and concatenates the pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pageOf(page1.messages, "/api/v1/topics/0.0.10590564/messages?page=2"))
      .mockResolvedValueOnce(pageOf([], null));
    vi.stubGlobal("fetch", fetchMock);

    const { messages } = await fetchDecodedTopicMessagePages("0.0.10590564");

    expect(messages).toHaveLength(page1.messages.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is not truncated when the last page says there is nothing behind it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pageOf(page1.messages, null)));

    expect((await fetchDecodedTopicMessagePages("0.0.10590564")).truncated).toBe(false);
  });

  it("stops at maxPages and says the answer is a window, not the topic", async () => {
    // A fresh Response per call: a body can only be read once, and this mock is hit three times.
    const fetchMock = vi.fn(() =>
      Promise.resolve(pageOf(page1.messages, "/api/v1/topics/0.0.10590564/messages?page=n")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { truncated } = await fetchDecodedTopicMessagePages("0.0.10590564", { maxPages: 3 });

    expect(truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a malformed topic id before hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDecodedTopicMessagePages("topic")).rejects.toThrow("Invalid topic ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchTopic", () => {
  it("reads the keys that decide who may write to a topic", async () => {
    const topic = { topic_id: "0.0.10590564", memo: "releases", deleted: false, submit_key: null, admin_key: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(topic))));

    await expect(fetchTopic("0.0.10590564")).resolves.toMatchObject({ submit_key: null });
  });
});

describe("hasSubmitKey", () => {
  const topic = { topic_id: "0.0.1", memo: "", deleted: false, admin_key: null };

  it("is false for a topic anyone can submit to", () => {
    expect(hasSubmitKey({ ...topic, submit_key: null })).toBe(false);
  });

  it("is false for a key Mirror reports with an empty value", () => {
    expect(hasSubmitKey({ ...topic, submit_key: { _type: "ED25519", key: "" } })).toBe(false);
  });

  it("is true once a key is set", () => {
    expect(hasSubmitKey({ ...topic, submit_key: { _type: "ED25519", key: "302a30" } })).toBe(true);
  });
});
