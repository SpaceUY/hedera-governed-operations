import { SETTINGS_COPY } from "./copy";
import { describe, expect, it } from "vitest";

describe("SETTINGS_COPY", () => {
  it("names the screen and the way back", () => {
    expect(SETTINGS_COPY.heading).toBe("Settings");
    expect(SETTINGS_COPY.back).toBe("← Map");
  });
});

describe("SETTINGS_COPY.council", () => {
  it("says where the council lives and what seating the agent would make", () => {
    expect(SETTINGS_COPY.council.heading).toBe("Council · native Hedera");
    expect(SETTINGS_COPY.council.ruleSuffix).toBe("signatures move the treasury");
    expect(SETTINGS_COPY.council.note).toBe(
      "These approvers don’t exist in any contract. They are the keys inside the treasury account’s ThresholdKey, read from the Mirror Node — not from the EVM.",
    );
    expect(SETTINGS_COPY.council.agentNotSeated("2-of-4")).toBe(
      "Not seated. Tick it below to propose a 2-of-4 council.",
    );
  });
});

describe("SETTINGS_COPY.roles", () => {
  it("describes the registry's roles and why changing them is a proposal", () => {
    expect(SETTINGS_COPY.roles.heading).toBe("Contract roles · EVM · proposal registry");
    expect(SETTINGS_COPY.roles.onlyTreasury("0.0.7")).toBe("Treasury account 0.0.7 — the only holder");
    expect(SETTINGS_COPY.roles.registryItself).toBe("The registry itself");
    expect(SETTINGS_COPY.roles.note).toBe(
      "Because the registry administers its own roles, changing who may propose is itself a proposal the council approves.",
    );
  });
});

describe("SETTINGS_COPY.composer", () => {
  it("words the composer as the chain works: one native schedule, both councils' thresholds", () => {
    expect(SETTINGS_COPY.composer.heading).toBe("Propose a council change · native");
    expect(SETTINGS_COPY.composer.thresholdLabel).toBe("Signatures required");
    expect(SETTINGS_COPY.composer.bothCouncils("2-of-3", "2-of-4")).toBe(
      "Changing the council takes two thresholds: the current 2-of-3 council's, and the proposed 2-of-4 council's own. " +
        "The schedule waits until both are met; it does not fail while it waits.",
    );
    expect(SETTINGS_COPY.composer.risks.anyOneKey(3)).toBe(
      "A 1-of-3 council lets any single key move the treasury alone.",
    );
    expect(SETTINGS_COPY.composer.risks.oneLostKeyFreezes(3)).toBe(
      "In a 3-of-3 council, one lost key would freeze the treasury.",
    );
    expect(SETTINGS_COPY.composer.risks.viewerLeaves(true)).toBe(
      "Your wallet would no longer be a council key. You would keep PROPOSER_ROLE.",
    );
    expect(SETTINGS_COPY.composer.risks.viewerLeaves(false)).toBe("Your wallet would no longer be a council key.");
  });
});
