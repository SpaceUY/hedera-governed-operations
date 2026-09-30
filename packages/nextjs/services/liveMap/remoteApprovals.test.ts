import { type SessionWrites, remoteApprovals } from "./remoteApprovals";
import { describe, expect, it } from "vitest";
import type { AnimationEvent } from "~~/services/liveMap/events/mapEvents";
import { ALICE, BOB, DAVE, TRANSFER, ago, proposal, world } from "~~/services/liveMap/motion/motionFixtures";

const ID = "0.0.9001";
/** The connected account `0.0.4101` holds Alice's key, and opened the proposal. */
const WORLD = world([proposal({ id: ID, operation: TRANSFER, creator: "0.0.4101" })]);
const IDLE: SessionWrites = { accountId: "0.0.4101", memberKey: ALICE, signed: [], opened: [], opening: false };

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

  it("treats every approval as remote for an account whose key holds no seat, however much it signed", () => {
    const operator = { ...IDLE, accountId: "0.0.4001", memberKey: "b3BlcmF0b3I=", signed: [ID] };
    expect(members(remoteApprovals([approvedBy(BOB)], operator, WORLD))).toEqual([BOB]);
  });

  it("tells a member that is no proposer its own approval from the next member's, by its key", () => {
    // Before, an account outside the proposer list took every approval on a schedule it signed for its own.
    const member = { ...IDLE, accountId: "0.0.9999", memberKey: BOB, signed: [ID] };
    expect(members(remoteApprovals([approvedBy(BOB), approvedBy(DAVE)], member, WORLD))).toEqual([DAVE]);
  });

  it("announces nothing on a schedule it signed while the connected account's key is still being read", () => {
    const reading = { ...IDLE, memberKey: null, signed: [ID] };
    expect(remoteApprovals([approvedBy(BOB)], reading, WORLD)).toEqual([]);
  });

  it("never announces anything that is not an approval", () => {
    expect(remoteApprovals([PROPOSED, { kind: "executed", scheduleId: ID, at: ago(1) }], IDLE, WORLD)).toEqual([]);
  });
});
