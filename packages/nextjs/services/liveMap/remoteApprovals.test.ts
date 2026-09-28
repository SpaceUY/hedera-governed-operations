import { type SessionWrites, remoteApprovals } from "./remoteApprovals";
import { describe, expect, it } from "vitest";
import type { AnimationEvent } from "~~/services/governance/mapEvents";
import { ALICE, BOB, TRANSFER, ago, proposal, world } from "~~/services/liveMap/motion/motionFixtures";

const ID = "0.0.9001";
/** Alice holds a seat and is the proposer `0.0.4101`; `0.0.4001` proposes without a seat. */
const WORLD = world([proposal({ id: ID, operation: TRANSFER, creator: "0.0.4101" })]);
const IDLE: SessionWrites = { accountId: "0.0.4101", signed: [], opened: [], opening: false };

const approvedBy = (memberKey: string): AnimationEvent => ({ kind: "approved", scheduleId: ID, memberKey, at: ago(2) });
const PROPOSED: AnimationEvent = { kind: "proposed", scheduleId: ID, at: ago(3) };
const members = (events: AnimationEvent[]) => events.map(event => (event.kind === "approved" ? event.memberKey : ""));

describe("remoteApprovals", () => {
  it("counts every approval as remote when this session sent nothing", () => {
    expect(members(remoteApprovals([approvedBy(ALICE), approvedBy(BOB)], IDLE, WORLD))).toEqual([ALICE, BOB]);
    expect(members(remoteApprovals([approvedBy(BOB)], { ...IDLE, accountId: null }, WORLD))).toEqual([BOB]);
  });

  it("does not announce the signature this session sent, but does announce another member's on the same read", () => {
    const signed = { ...IDLE, signed: [ID] };
    expect(members(remoteApprovals([approvedBy(ALICE), approvedBy(BOB)], signed, WORLD))).toEqual([BOB]);
  });

  it("does not announce the creator's own approval when this session opened the proposal", () => {
    const events = [PROPOSED, approvedBy(ALICE)];
    expect(remoteApprovals(events, { ...IDLE, opened: [ID] }, WORLD)).toEqual([]);
    // Opened elsewhere by the same seat: that is a signature from another device.
    expect(members(remoteApprovals(events, IDLE, WORLD))).toEqual([ALICE]);
  });

  it("recognises a proposal this session is still opening by its creator", () => {
    const opening = { ...IDLE, opening: true };
    expect(remoteApprovals([PROPOSED, approvedBy(ALICE)], opening, WORLD)).toEqual([]);
    // A later approval on it is not part of opening it.
    expect(members(remoteApprovals([approvedBy(ALICE)], opening, WORLD))).toEqual([ALICE]);
  });

  it("treats every approval as remote for a proposer whose key holds no seat, however much it signed", () => {
    const operator = { ...IDLE, accountId: "0.0.4001", signed: [ID] };
    expect(members(remoteApprovals([approvedBy(BOB)], operator, WORLD))).toEqual([BOB]);
  });

  it("cannot tell apart the approvals on a schedule signed by an account whose key the map does not read", () => {
    const stranger = { ...IDLE, accountId: "0.0.9999", signed: [ID] };
    expect(remoteApprovals([approvedBy(BOB)], stranger, WORLD)).toEqual([]);
  });

  it("never announces anything that is not an approval", () => {
    expect(remoteApprovals([PROPOSED, { kind: "executed", scheduleId: ID, at: ago(1) }], IDLE, WORLD)).toEqual([]);
  });
});
