import { cardPlaceOf } from "./useRefocusMovedCard";
import type { Proposal } from "@sh/core/governance/proposals";
import { describe, expect, it } from "vitest";

const row = (scheduleId: string) => ({ schedule: { schedule_id: scheduleId } }) as unknown as Proposal;
const lists = { pending: [row("0.0.1")], settled: [row("0.0.2")] };

describe("cardPlaceOf", () => {
  it("names the list the selected card is drawn in", () => {
    expect(cardPlaceOf("0.0.1", lists)).toBe("pending");
    expect(cardPlaceOf("0.0.2", lists)).toBe("settled");
  });

  it("places a selection neither list holds with the search", () => {
    expect(cardPlaceOf("0.0.99", lists)).toBe("search");
  });

  it("has no place while nothing is selected or the inbox is still loading", () => {
    expect(cardPlaceOf(null, lists)).toBeNull();
    expect(cardPlaceOf("0.0.1", null)).toBeNull();
  });
});
