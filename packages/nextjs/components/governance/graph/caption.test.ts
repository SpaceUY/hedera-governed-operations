import { mapCaptionOf } from "./caption";
import { describe, expect, it } from "vitest";

describe("mapCaptionOf", () => {
  it("says nothing moves until the council signs while nothing is shown", () => {
    expect(mapCaptionOf({ kind: "idle" }, "2-of-3")).toEqual({
      lead: "Nothing moves until the 2-of-3 council signs.",
      text: "Select an operation to see what it would do.",
    });
  });

  it("asks for a kind while drafting has nothing to draw, and names the draft once it has", () => {
    expect(mapCaptionOf({ kind: "drafting", title: null }, "2-of-3")).toEqual({
      lead: "Drafting.",
      text: "Pick an operation type.",
    });
    expect(mapCaptionOf({ kind: "drafting", title: "Upgrade the vault to v2" }, "2-of-3")).toEqual({
      lead: "Drafting.",
      text: "Dashed violet is what “Upgrade the vault to v2” would do once the 2-of-3 council signs.",
    });
  });

  it("names the selected proposal and what its lines mean", () => {
    expect(mapCaptionOf({ kind: "previewing", title: "Upgrade the vault to v2" }, "2-of-3")).toEqual({
      lead: "Upgrade the vault to v2.",
      text: "Dashed violet is what would happen once the 2-of-3 council signs.",
    });
    expect(mapCaptionOf({ kind: "history", title: "Pay a supplier" }, "2-of-3").text).toBe(
      "Mint is the path it took. It is done: the line stays only while it is selected.",
    );
    expect(mapCaptionOf({ kind: "void", title: "Pay a supplier" }, "2-of-3").text).toBe(
      "Muted dashes are the path it would have taken. It never ran.",
    );
  });
});
