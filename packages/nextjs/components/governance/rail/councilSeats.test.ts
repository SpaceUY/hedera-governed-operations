import { AGENT_COPY } from "./copy";
import { councilSeatOf, unseatedAgentSeatOf, withSeat } from "./councilSeats";
import type { CouncilKey } from "@sh/core/governance/council";
import { describe, expect, it } from "vitest";

const COUNCIL: CouncilKey = { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] };
const PROPOSERS = [
  { accountId: "0.0.101", key: "key-a" },
  { accountId: "0.0.102", key: "key-b" },
];

describe("councilSeatOf", () => {
  it("names a seat as the map does, with its caption and the account holding it", () => {
    const seat = councilSeatOf("key-b", {
      proposers: PROPOSERS,
      viewerAccountId: null,
      memberNames: { "key-b": { name: "Bob", caption: "demo co-signer" } },
    });
    expect(seat).toEqual({
      name: "Bob",
      caption: "demo co-signer",
      monogram: undefined,
      accountId: "0.0.102",
      isViewer: false,
    });
  });

  it("falls back to the proposer's account or the start of the key, and marks the viewer's own seat", () => {
    expect(councilSeatOf("key-a", { proposers: PROPOSERS, viewerAccountId: "0.0.101" })).toMatchObject({
      name: "You",
      isViewer: true,
    });
    expect(councilSeatOf("key-c", { proposers: PROPOSERS, viewerAccountId: null })).toMatchObject({
      name: "Member key-c…",
      accountId: undefined,
    });
  });

  it("names the co-signing agent's seat as the agent, with its account", () => {
    const seat = councilSeatOf("key-c", {
      proposers: PROPOSERS,
      viewerAccountId: null,
      agent: { accountId: "0.0.600", seat: "key-c" },
    });
    expect(seat).toEqual({
      name: AGENT_COPY.name,
      caption: undefined,
      monogram: AGENT_COPY.monogram,
      accountId: "0.0.600",
      isViewer: false,
    });
  });
});

describe("the agent's caption", () => {
  const agent = { accountId: "0.0.600", seat: "key-c" };

  it("carries the map's caption for the agent's seat, where the map names it the agent", () => {
    const memberNames = { "key-c": { name: AGENT_COPY.name, caption: "seated by the council" } };
    expect(councilSeatOf("key-c", { proposers: PROPOSERS, viewerAccountId: null, memberNames, agent }).caption).toBe(
      "seated by the council",
    );
  });

  it("drops the caption where the map names that key as someone else, an agent left on a demo member's key", () => {
    const memberNames = { "key-c": { name: "Bob", caption: "demo co-signer" } };
    expect(
      councilSeatOf("key-c", { proposers: PROPOSERS, viewerAccountId: null, memberNames, agent }).caption,
    ).toBeUndefined();
  });
});

describe("the unseated agent", () => {
  it("is the agent's seat while the council lacks it, and nothing otherwise", () => {
    expect(unseatedAgentSeatOf({ accountId: "0.0.600", seat: "key-d" }, COUNCIL)).toBe("key-d");
    expect(unseatedAgentSeatOf({ accountId: "0.0.600", seat: "key-c" }, COUNCIL)).toBeNull();
    expect(unseatedAgentSeatOf({ accountId: "0.0.600", seat: null }, COUNCIL)).toBeNull();
    expect(unseatedAgentSeatOf(null, COUNCIL)).toBeNull();
  });

  it("would make the same threshold over one more seat", () => {
    expect(withSeat(COUNCIL, "key-d")).toEqual({ threshold: 2, memberKeys: ["key-a", "key-b", "key-c", "key-d"] });
  });
});
