import { upsertEnvContent } from "./envFile";
import { describe, expect, it } from "vitest";

describe("upsertEnvContent", () => {
  it("adds a key to empty content", () => {
    expect(upsertEnvContent("", { TOPIC_ID: "0.0.1" })).toBe("TOPIC_ID=0.0.1\n");
  });

  it("replaces the value of an existing key in place", () => {
    expect(upsertEnvContent("A=1\nTOPIC_ID=old\nB=2\n", { TOPIC_ID: "new" })).toBe("A=1\nTOPIC_ID=new\nB=2\n");
  });

  it("appends keys that are not present after the existing lines", () => {
    expect(upsertEnvContent("A=1\n", { TOPIC_ID: "0.0.1" })).toBe("A=1\nTOPIC_ID=0.0.1\n");
  });

  it("preserves comments and blank lines", () => {
    expect(upsertEnvContent("# comment\n\nA=1\n", { A: "2" })).toBe("# comment\n\nA=2\n");
  });

  it("does not touch keys that merely share a prefix", () => {
    expect(upsertEnvContent("TOPIC_ID_OLD=x\n", { TOPIC_ID: "y" })).toBe("TOPIC_ID_OLD=x\nTOPIC_ID=y\n");
  });

  it("adds a trailing newline when the content lacks one", () => {
    expect(upsertEnvContent("A=1", { B: "2" })).toBe("A=1\nB=2\n");
  });

  it("replaces a key that is set to an empty value", () => {
    expect(upsertEnvContent("TOPIC_ID=\n", { TOPIC_ID: "0.0.9" })).toBe("TOPIC_ID=0.0.9\n");
  });
});
