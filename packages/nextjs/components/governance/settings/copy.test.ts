import { SETTINGS_COPY } from "./copy";
import { describe, expect, it } from "vitest";

describe("SETTINGS_COPY", () => {
  it("names the screen and the way back", () => {
    expect(SETTINGS_COPY.heading).toBe("Settings");
    expect(SETTINGS_COPY.back).toBe("← Map");
  });
});
