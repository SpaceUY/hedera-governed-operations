import { ALICE, TRANSFER, ago, proposal, world } from "./motionFixtures";
import { proposalShown, proposalsShown } from "./world";
import { describe, expect, it } from "vitest";

const HELD = proposal({ id: "0.0.1", operation: TRANSFER });
const LIVE = proposal({ id: "0.0.1", operation: TRANSFER, signatures: [[ALICE, ago(2)]] });
const OTHER = proposal({ id: "0.0.2", operation: TRANSFER, signatures: [[ALICE, ago(2)]] });

describe("proposalShown", () => {
  it("shows the live proposal while the map plays nothing of it", () => {
    expect(proposalShown(LIVE, { busy: [], shown: world([HELD]) })).toBe(LIVE);
  });

  it("shows the proposal as the map draws it while the map still plays it", () => {
    expect(proposalShown(LIVE, { busy: ["0.0.1"], shown: world([HELD]) })).toBe(HELD);
  });

  it("shows the live proposal when the map's world never had it (a new proposal)", () => {
    expect(proposalShown(LIVE, { busy: ["0.0.1"], shown: world([]) })).toBe(LIVE);
  });

  it("shows the live proposal when the map has drawn nothing yet", () => {
    expect(proposalShown(LIVE, { busy: ["0.0.1"], shown: null })).toBe(LIVE);
  });
});

describe("proposalsShown", () => {
  it("holds only the proposals the map is playing", () => {
    const shown = world([HELD, proposal({ id: "0.0.2", operation: TRANSFER })]);
    expect(proposalsShown([LIVE, OTHER], { busy: ["0.0.1"], shown })).toEqual([HELD, OTHER]);
  });
});
