import { rotationResultTitle } from "./rotationResult";
import { describe, expect, it } from "vitest";

const BEFORE = { threshold: 2, memberKeys: ["you", "alice", "bob"] };
const WITH_AGENT = { threshold: 2, memberKeys: ["you", "alice", "bob", "agent"] };

describe("rotationResultTitle", () => {
  it("says the agent is seated when the rotation added the configured agent's key", () => {
    expect(rotationResultTitle({ incoming: WITH_AGENT, before: BEFORE, agentSeat: "agent" })).toBe(
      "The co-signing agent is seated · 2-of-4 council",
    );
  });

  it("says only what the council is now when the agent already sat", () => {
    const raised = { ...WITH_AGENT, threshold: 3 };
    expect(rotationResultTitle({ incoming: raised, before: WITH_AGENT, agentSeat: "agent" })).toBe(
      "The council is now 3-of-4",
    );
  });

  it("says only what the council is now for a rotation that does not involve the agent", () => {
    expect(rotationResultTitle({ incoming: BEFORE, before: WITH_AGENT, agentSeat: "agent" })).toBe(
      "The council is now 2-of-3",
    );
    expect(rotationResultTitle({ incoming: WITH_AGENT, before: BEFORE, agentSeat: null })).toBe(
      "The council is now 2-of-4",
    );
  });

  it("says only what the council is now when the earlier council could not be read", () => {
    expect(rotationResultTitle({ incoming: WITH_AGENT, before: null, agentSeat: "agent" })).toBe(
      "The council is now 2-of-4",
    );
  });

  it("says nothing yet while the earlier council is being read", () => {
    expect(rotationResultTitle({ incoming: WITH_AGENT, before: undefined, agentSeat: "agent" })).toBeNull();
  });
});
