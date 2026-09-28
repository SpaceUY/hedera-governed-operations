import { mapEdgeCaption, mapEdgeLabel } from "./copy";
import { describe, expect, it } from "vitest";

describe("mapEdgeCaption", () => {
  it.each([
    ["authority", "member", "governanceAccount", "is one of the keys"],
    ["authority", "governanceAccount", "executor", "EXECUTOR_ROLE · runs what the council approved"],
    ["authority", "member", "executor", "PROPOSER_ROLE · registers with 1 signature, no council"],
    ["authority", "proposer", "executor", "PROPOSER_ROLE · registers with 1 signature, no council"],
    ["authority", "executor", "target", "only accepts the registry"],
    ["authority", "target", "token", "holds the token's keys"],
    ["authority", "target", "external", "calls it"],
    ["funds", "external", "governanceAccount", "where the money is"],
    ["intent", "governanceAccount", "external", "a pending proposal would use this"],
  ] as const)("words a %s edge from %s to %s", (kind, from, to, caption) => {
    expect(mapEdgeCaption(kind, from, to)).toBe(caption);
  });

  it("names an edge by its kind, both ends and its meaning", () => {
    expect(mapEdgeLabel("funds", { from: "Vault", to: "Treasury" }, "where the money is")).toBe(
      "Money: Vault to Treasury, where the money is",
    );
  });
});
