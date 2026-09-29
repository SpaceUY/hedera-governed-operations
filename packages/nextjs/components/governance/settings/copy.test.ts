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
