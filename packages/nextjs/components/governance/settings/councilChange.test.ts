// @vitest-environment node
import {
  changeFrom,
  councilRiskOf,
  draftCouncilChange,
  isChanged,
  seatTagOf,
  stepThreshold,
  toggleSeat,
} from "./councilChange";
import { PrivateKey } from "@hiero-ledger/sdk";
import { type CouncilKey, memberKeyOfAccount } from "@sh/core/governance/council";
import { describe, expect, it } from "vitest";
import { previewDraft } from "~~/services/governance/drafts";

const seatOf = () => {
  const publicKey = PrivateKey.generateECDSA().publicKey;
  return memberKeyOfAccount({ _type: "ECDSA_SECP256K1", key: publicKey.toStringRaw() }) ?? "";
};
const [YOU, ALICE, BOB, AGENT] = [seatOf(), seatOf(), seatOf(), seatOf()];
const COUNCIL: CouncilKey = { threshold: 2, memberKeys: [YOU, ALICE, BOB] };
const OFFERED = [YOU, ALICE, BOB, AGENT];
const TREASURY = "0.0.4000";

describe("composing a council change", () => {
  it("starts from the council the ledger has, which is no change at all", () => {
    const change = changeFrom(COUNCIL);
    expect(change).toEqual({ threshold: 2, memberKeys: [YOU, ALICE, BOB] });
    expect(isChanged(change, COUNCIL)).toBe(false);
    expect(draftCouncilChange(TREASURY, change, COUNCIL)).toEqual({ status: "empty" });
  });

  it("keeps the seats in the order they are offered, whatever order they are ticked in", () => {
    const withoutAlice = toggleSeat(changeFrom(COUNCIL), ALICE, OFFERED);
    const withAgent = toggleSeat(withoutAlice, AGENT, OFFERED);
    const back = toggleSeat(withAgent, ALICE, OFFERED);
    expect(back.memberKeys).toEqual([YOU, ALICE, BOB, AGENT]);
  });

  it("never asks for more signatures than there are seats, nor fewer than one", () => {
    let change = changeFrom(COUNCIL);
    change = toggleSeat(change, BOB, OFFERED);
    change = toggleSeat(change, ALICE, OFFERED);
    expect(change).toEqual({ threshold: 1, memberKeys: [YOU] });
    expect(stepThreshold(change, 1).threshold).toBe(1);
    expect(stepThreshold(change, -1).threshold).toBe(1);
    expect(stepThreshold(toggleSeat(change, YOU, OFFERED), -1)).toEqual({ threshold: 1, memberKeys: [] });
  });

  it("tags the seats that would join and the ones that would leave", () => {
    const change = toggleSeat(toggleSeat(changeFrom(COUNCIL), BOB, OFFERED), AGENT, OFFERED);
    expect(seatTagOf(AGENT, change, COUNCIL)).toBe("joins");
    expect(seatTagOf(BOB, change, COUNCIL)).toBe("leaves");
    expect(seatTagOf(YOU, change, COUNCIL)).toBeNull();
  });
});

describe("councilRiskOf", () => {
  it("warns about a council any one key moves, one lost key freezes, or the viewer leaving", () => {
    expect(councilRiskOf({ threshold: 1, memberKeys: [YOU, ALICE] }, COUNCIL, YOU)).toBe("anyOneKey");
    expect(councilRiskOf({ threshold: 3, memberKeys: [YOU, ALICE, BOB] }, COUNCIL, YOU)).toBe("oneLostKeyFreezes");
    expect(councilRiskOf({ threshold: 2, memberKeys: [ALICE, BOB, AGENT] }, COUNCIL, YOU)).toBe("viewerLeaves");
    expect(councilRiskOf({ threshold: 2, memberKeys: [YOU, ALICE, BOB, AGENT] }, COUNCIL, YOU)).toBeNull();
    expect(councilRiskOf({ threshold: 1, memberKeys: [YOU] }, COUNCIL, YOU)).toBeNull();
  });

  it("does not warn a viewer who holds no seat today about leaving", () => {
    expect(councilRiskOf({ threshold: 2, memberKeys: [ALICE, BOB, AGENT] }, COUNCIL, null)).toBeNull();
  });
});

describe("draftCouncilChange", () => {
  it("drafts the rotation to exactly the ticked seats and threshold, readable back by the decoder", () => {
    const change = { threshold: 2, memberKeys: [YOU, ALICE, BOB, AGENT] };
    const result = draftCouncilChange(TREASURY, change, COUNCIL);
    if (result.status !== "ready") throw new Error("expected a draft");
    const preview = previewDraft(result.draft);
    if (preview.path !== "native" || preview.scheduled.kind !== "councilRotation")
      throw new Error("expected a rotation");
    expect(preview.scheduled.accountId).toBe(TREASURY);
    expect(preview.scheduled.council).toEqual(change);
  });

  it("drafts a change of threshold alone", () => {
    expect(draftCouncilChange(TREASURY, { threshold: 3, memberKeys: [YOU, ALICE, BOB] }, COUNCIL).status).toBe("ready");
  });

  it("passes on the encoder's own words for a council with no members", () => {
    const result = draftCouncilChange(TREASURY, { threshold: 1, memberKeys: [] }, COUNCIL);
    expect(result).toEqual({
      status: "invalid",
      message: "A council with no members could never approve anything",
    });
  });
});
