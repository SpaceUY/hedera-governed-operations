import { inspectorEdgeBody, inspectorNodeBody, mapEdgeCaption, mapEdgeLabel } from "./copy";
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

describe("inspectorNodeBody", () => {
  const facts = { rule: "2-of-3", seated: true, proposes: false, introduced: false };

  it.each([
    ["governanceAccount", "a 2-of-3 council"],
    ["executor", "only the treasury account (EXECUTOR_ROLE) may execute"],
    ["member", "one of the keys inside the treasury account's ThresholdKey"],
    ["proposer", "it cannot approve"],
    ["target", "accepts calls only from the registry"],
    ["token", "Hedera's Token Service"],
    ["external", "nothing here controls it"],
  ] as const)("says what a %s is", (role, words) => {
    expect(inspectorNodeBody(role, facts).toLowerCase()).toContain(words.toLowerCase());
  });

  it("says a member proposes too when its account holds the role, and when a rotation would seat it", () => {
    expect(inspectorNodeBody("member", { ...facts, proposes: true })).toContain("PROPOSER_ROLE");
    expect(inspectorNodeBody("member", { ...facts, seated: false })).toContain("would seat it");
  });

  it("tells an account a proposal introduced from a contract outside the system", () => {
    expect(inspectorNodeBody("external", { ...facts, introduced: true })).toContain("would pay");
  });
});

describe("inspectorEdgeBody", () => {
  it.each([
    ["authority", "member", "governanceAccount", "one of the treasury's threshold keys"],
    ["authority", "governanceAccount", "executor", "Only the treasury account holds EXECUTOR_ROLE"],
    ["authority", "proposer", "executor", "registering is not approving"],
    ["authority", "executor", "target", "accepts calls only from the registry"],
    ["authority", "target", "token", "The token's keys are this contract"],
    ["authority", "target", "external", "outside the system"],
    ["funds", "external", "governanceAccount", "Where the money goes"],
    ["funds", "target", "governanceAccount", "Where the money is"],
    ["intent", "governanceAccount", "external", "a pending proposal would use it"],
  ] as const)("explains a %s edge from %s to %s", (kind, from, to, words) => {
    expect(inspectorEdgeBody(kind, from, to)).toContain(words);
  });
});
