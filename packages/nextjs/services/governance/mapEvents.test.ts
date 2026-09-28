import {
  type AnimationEvent,
  EVENT_FRESHNESS_MS,
  type GovernanceSnapshot,
  animationEventKey,
  diffSnapshots,
} from "./mapEvents";
import { type CouncilKey, countThresholdSignatures } from "@sh/core/governance/council";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import { type MirrorSchedule, type ScheduleExecution, deriveScheduleState } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import { describe, expect, it } from "vitest";

const [ALICE, BOB, CAROL, DAVE] = ["YWxpY2U=", "Ym9i", "Y2Fyb2w=", "ZGF2ZQ=="];
/** Pays for schedules and holds no seat, like the fixture's payer. */
const PAYER = "cGF5ZXI=";
const PROPOSER = "0.0.4100";
const OTHER_PROPOSER = "0.0.4200";
const COUNCIL: CouncilKey = { threshold: 2, memberKeys: [ALICE, BOB, CAROL] };
const INCOMING: CouncilKey = { threshold: 2, memberKeys: [ALICE, BOB, DAVE] };

const NOW_SECONDS = 1_790_000_000;
const NOW = new Date(NOW_SECONDS * 1000);
/** A consensus timestamp this many seconds before `NOW`, with an optional nanosecond offset. */
const ago = (seconds: number, nanos = 0): string => `${NOW_SECONDS - seconds}.${String(nanos).padStart(9, "0")}`;

const TRANSFER: ScheduledOperation = { kind: "treasuryTransfer", hbar: [], tokens: [] };
const ROTATION: ScheduledOperation = { kind: "councilRotation", accountId: "0.0.4000", council: INCOMING };

type Draft = {
  id: string;
  createdAt: string;
  /** Member (or payer) keys and when their row reached the schedule. */
  signatures?: Array<[string, string]>;
  creator?: string;
  executedAt?: string;
  execution?: ScheduleExecution;
  operation?: ScheduledOperation;
  deleted?: boolean;
};

/** A proposal as the inbox builds it: progress counted from the signature rows by the real rule. */
function proposal({
  id,
  createdAt,
  signatures = [],
  creator = PROPOSER,
  executedAt,
  execution = { status: "notRun" },
  operation = TRANSFER,
  deleted = false,
}: Draft): Proposal {
  const schedule: MirrorSchedule = {
    ...(executedSchedule as MirrorSchedule),
    schedule_id: id,
    creator_account_id: creator,
    consensus_timestamp: createdAt,
    executed_timestamp: executedAt ?? null,
    expiration_time: null,
    deleted,
    signatures: signatures.map(([key, at]) => ({
      consensus_timestamp: at,
      public_key_prefix: key,
      signature: "",
      type: "ED25519",
    })),
  };
  return {
    schedule,
    state: deriveScheduleState(schedule, NOW),
    execution,
    progress: countThresholdSignatures(schedule, COUNCIL),
    incomingProgress:
      operation.kind === "councilRotation" ? countThresholdSignatures(schedule, operation.council) : null,
    operation,
    registry: { status: "notApplicable" },
  };
}

const snapshot = (proposals: Proposal[], overrides: Partial<GovernanceSnapshot> = {}): GovernanceSnapshot => ({
  council: COUNCIL,
  proposers: [{ accountId: PROPOSER, key: ALICE }],
  proposals,
  unreachableProposers: [],
  treasury: null,
  ...overrides,
});

const diff = (previous: Proposal[], next: Proposal[]) => diffSnapshots(snapshot(previous), snapshot(next), NOW);

const succeeded = (): ScheduleExecution => ({
  status: "succeeded",
  transaction: { result: "SUCCESS" } as Extract<ScheduleExecution, { status: "succeeded" }>["transaction"],
});
const failed = (result: string): ScheduleExecution => ({
  status: "failed",
  result,
  transaction: { result } as Extract<ScheduleExecution, { status: "failed" }>["transaction"],
});

/** Alice opened it and signed with the create; the payer's row rides along. */
const OPENED = {
  id: "0.0.9001",
  createdAt: ago(20),
  signatures: [
    [ALICE, ago(20)],
    [PAYER, ago(20)],
  ] as Array<[string, string]>,
};

describe("diffSnapshots", () => {
  it("finds nothing between two reads of the same world, even when they are different objects", () => {
    expect(diff([proposal(OPENED)], [proposal(OPENED)])).toEqual([]);
  });

  it("reports a new proposal, then the approval of the member who opened it, and not the payer's row", () => {
    expect(diff([], [proposal(OPENED)])).toEqual([
      { kind: "proposed", scheduleId: "0.0.9001", at: ago(20) },
      { kind: "approved", scheduleId: "0.0.9001", memberKey: ALICE, at: ago(20) },
    ]);
  });

  it("reports a signature from another device like any other, timed by its own row", () => {
    const signed = proposal({ ...OPENED, signatures: [...OPENED.signatures, [BOB, ago(4)], [PAYER, ago(4)]] });

    expect(diff([proposal(OPENED)], [signed])).toEqual([
      { kind: "approved", scheduleId: "0.0.9001", memberKey: BOB, at: ago(4) },
    ]);
  });

  it("reports two approvals that landed between polls oldest first", () => {
    const pending = proposal({ ...OPENED, signatures: [[PAYER, ago(20)]] });
    const signed = proposal({
      ...OPENED,
      signatures: [
        [CAROL, ago(3)],
        [PAYER, ago(20)],
        [BOB, ago(8)],
      ],
    });

    expect(diff([pending], [signed]).map(event => event.kind === "approved" && event.memberKey)).toEqual([BOB, CAROL]);
  });

  it("dates an approval by the member's first row, not by a later ScheduleSign it paid for", () => {
    const signed = proposal({
      ...OPENED,
      signatures: [
        [BOB, ago(2)],
        [BOB, ago(9)],
      ],
    });

    expect(diff([proposal({ ...OPENED, signatures: [] })], [signed])).toContainEqual({
      kind: "approved",
      scheduleId: "0.0.9001",
      memberKey: BOB,
      at: ago(9),
    });
  });

  it("orders the approval that completed the threshold before the run it triggered", () => {
    const executed = proposal({
      ...OPENED,
      signatures: [...OPENED.signatures, [BOB, ago(4, 104)]],
      executedAt: ago(4, 105),
      execution: succeeded(),
    });

    expect(diff([proposal(OPENED)], [executed])).toEqual([
      { kind: "approved", scheduleId: "0.0.9001", memberKey: BOB, at: ago(4, 104) },
      { kind: "executed", scheduleId: "0.0.9001", at: ago(4, 105) },
    ]);
  });

  it("orders events at the same instant as a proposal lives them: proposed, approved, run", () => {
    const openedAndRun = proposal({
      id: "0.0.9002",
      createdAt: ago(5),
      signatures: [
        [BOB, ago(5)],
        [ALICE, ago(5)],
      ],
      executedAt: ago(5),
      execution: succeeded(),
    });

    expect(diff([], [openedAndRun]).map(event => animationEventKey(event))).toEqual([
      "proposed:0.0.9002:",
      `approved:0.0.9002:${ALICE}`,
      `approved:0.0.9002:${BOB}`,
      "executed:0.0.9002:",
    ]);
  });

  it("reports a run that reverted as reverted, with the network's response code", () => {
    const reverted = proposal({ ...OPENED, executedAt: ago(3), execution: failed("CONTRACT_REVERT_EXECUTED") });

    expect(diff([proposal(OPENED)], [reverted])).toEqual([
      { kind: "reverted", scheduleId: "0.0.9001", at: ago(3), result: "CONTRACT_REVERT_EXECUTED" },
    ]);
  });

  describe("an execution whose outcome Mirror has not served yet", () => {
    const unconfirmed = proposal({ ...OPENED, executedAt: ago(10), execution: { status: "unconfirmed" } });

    it("reports nothing while only the executed timestamp is known, though the schedule reads as settled", () => {
      expect(unconfirmed.state.isSettled).toBe(true);
      expect(diff([proposal(OPENED)], [unconfirmed])).toEqual([]);
    });

    it("reports the outcome once it is read, dated when the transaction ran", () => {
      const confirmed = proposal({ ...OPENED, executedAt: ago(10), execution: succeeded() });

      expect(diff([unconfirmed], [confirmed])).toEqual([{ kind: "executed", scheduleId: "0.0.9001", at: ago(10) }]);
    });

    it("never reports a success and then a failure: the first event is the outcome", () => {
      const outcome = proposal({ ...OPENED, executedAt: ago(10), execution: failed("INSUFFICIENT_GAS") });
      const events = [diff([proposal(OPENED)], [unconfirmed]), diff([unconfirmed], [outcome])].flat();

      expect(events.map(event => event.kind)).toEqual(["reverted"]);
    });
  });

  it("reports an outcome once: a later read of the same outcome is not news", () => {
    const executed = proposal({ ...OPENED, executedAt: ago(10), execution: succeeded() });

    expect(diff([executed], [executed])).toEqual([]);
  });

  it("reports nothing for a proposal that was withdrawn or expired, since neither ran", () => {
    expect(diff([proposal(OPENED)], [proposal({ ...OPENED, deleted: true })])).toEqual([]);
  });

  describe("a council rotation", () => {
    const rotation = { ...OPENED, id: "0.0.9100", operation: ROTATION };

    it("reports an incoming member's approval, though the current council has no seat for it", () => {
      const signed = proposal({ ...rotation, signatures: [...rotation.signatures, [DAVE, ago(6)]] });

      expect(signed.progress.signedBy).not.toContain(DAVE);
      expect(diff([proposal(rotation)], [signed])).toEqual([
        { kind: "approved", scheduleId: "0.0.9100", memberKey: DAVE, at: ago(6) },
      ]);
    });

    it("reports a member who sits on both councils once, not once per council", () => {
      const signed = proposal({ ...rotation, signatures: [[BOB, ago(6)]] });

      expect(diff([proposal({ ...rotation, signatures: [] })], [signed])).toEqual([
        { kind: "approved", scheduleId: "0.0.9100", memberKey: BOB, at: ago(6) },
      ]);
    });

    it("reports the new council after the run that installed it", () => {
      const before = snapshot([proposal(rotation)]);
      const executed = proposal({
        ...rotation,
        signatures: [...rotation.signatures, [BOB, ago(6, 1)], [DAVE, ago(6, 2)]],
        executedAt: ago(6, 3),
        execution: succeeded(),
      });

      expect(diffSnapshots(before, snapshot([executed], { council: INCOMING }), NOW)).toEqual([
        { kind: "approved", scheduleId: "0.0.9100", memberKey: BOB, at: ago(6, 1) },
        { kind: "approved", scheduleId: "0.0.9100", memberKey: DAVE, at: ago(6, 2) },
        { kind: "executed", scheduleId: "0.0.9100", at: ago(6, 3) },
        { kind: "councilChanged", scheduleId: "0.0.9100", at: ago(6, 3), council: INCOMING },
      ]);
    });

    it("attributes a council that arrives on a later read to the rotation that already ran", () => {
      const executed = proposal({ ...rotation, executedAt: ago(6), execution: succeeded() });

      expect(diffSnapshots(snapshot([executed]), snapshot([executed], { council: INCOMING }), NOW)).toEqual([
        { kind: "councilChanged", scheduleId: "0.0.9100", at: ago(6), council: INCOMING },
      ]);
    });

    it("attributes a council read before the rotation's outcome to that rotation, which reports its run later", () => {
      const ran = proposal({ ...rotation, executedAt: ago(6), execution: { status: "unconfirmed" } });
      const confirmed = proposal({ ...rotation, executedAt: ago(6), execution: succeeded() });
      const councilFirst = snapshot([ran], { council: INCOMING });

      expect(diffSnapshots(snapshot([proposal(rotation)]), councilFirst, NOW)).toEqual([
        { kind: "councilChanged", scheduleId: "0.0.9100", at: ago(6), council: INCOMING },
      ]);
      expect(diffSnapshots(councilFirst, snapshot([confirmed], { council: INCOMING }), NOW)).toEqual([
        { kind: "executed", scheduleId: "0.0.9100", at: ago(6) },
      ]);
    });

    it("never attributes a council to a rotation that reverted, since it installed nothing", () => {
      const reverted = proposal({ ...rotation, executedAt: ago(6), execution: failed("INVALID_SIGNATURE") });

      expect(diffSnapshots(snapshot([reverted]), snapshot([reverted], { council: INCOMING }), NOW)).toEqual([
        { kind: "councilChanged", scheduleId: null, at: null, council: INCOMING },
      ]);
    });
  });

  describe("a council change no rotation in the inbox explains", () => {
    it("is reported for a threshold change alone, with no schedule and no time", () => {
      const raised: CouncilKey = { ...COUNCIL, threshold: 3 };

      expect(diffSnapshots(snapshot([]), snapshot([], { council: raised }), NOW)).toEqual([
        { kind: "councilChanged", scheduleId: null, at: null, council: raised },
      ]);
    });

    it("is not reported when the same members only come back in another order", () => {
      const reordered: CouncilKey = { ...COUNCIL, memberKeys: [CAROL, ALICE, BOB] };

      expect(diffSnapshots(snapshot([]), snapshot([], { council: reordered }), NOW)).toEqual([]);
    });
  });

  describe("the inbox window", () => {
    it("reports nothing for a proposal that dropped out of it", () => {
      expect(diff([proposal(OPENED)], [])).toEqual([]);
    });

    it("reports nothing for a proposal that reappears because its proposer can be read again", () => {
      const hidden = snapshot([], { unreachableProposers: [PROPOSER] });
      const signed = proposal({ ...OPENED, signatures: [...OPENED.signatures, [BOB, ago(4)]] });

      expect(diffSnapshots(hidden, snapshot([signed]), NOW)).toEqual([]);
    });

    it("still reports a new proposal by a proposer that was readable while another was not", () => {
      const partial = snapshot([], { unreachableProposers: [OTHER_PROPOSER] });

      expect(diffSnapshots(partial, snapshot([proposal(OPENED)]), NOW).map(event => event.kind)).toEqual([
        "proposed",
        "approved",
      ]);
    });
  });

  describe("freshness", () => {
    const tooOld = EVENT_FRESHNESS_MS / 1000 + 1;

    it("drops what happened longer ago than the cutoff, as after a tab was hidden", () => {
      const old = { ...OPENED, createdAt: ago(tooOld), signatures: [[ALICE, ago(tooOld)]] as Array<[string, string]> };
      const executed = proposal({ ...old, executedAt: ago(tooOld), execution: succeeded() });

      expect(diff([], [proposal(old)])).toEqual([]);
      expect(diff([proposal(old)], [executed])).toEqual([]);
    });

    it("keeps the fresh events of a change whose older part is stale", () => {
      const old = { ...OPENED, createdAt: ago(tooOld), signatures: [[ALICE, ago(tooOld)]] as Array<[string, string]> };
      const signed = proposal({ ...old, signatures: [...old.signatures, [BOB, ago(2)]] });

      expect(diff([], [signed]).map(event => animationEventKey(event))).toEqual([`approved:0.0.9001:${BOB}`]);
    });

    it("keeps an event exactly at the cutoff", () => {
      const atCutoff = { ...OPENED, createdAt: ago(EVENT_FRESHNESS_MS / 1000), signatures: [] };

      expect(diff([], [proposal(atCutoff)])).toHaveLength(1);
    });

    it("drops a stale council change but keeps one it cannot date", () => {
      const rotation = proposal({
        ...OPENED,
        operation: ROTATION,
        executedAt: ago(tooOld),
        execution: succeeded(),
      });

      expect(diffSnapshots(snapshot([rotation]), snapshot([rotation], { council: INCOMING }), NOW)).toEqual([]);
      expect(diffSnapshots(snapshot([]), snapshot([], { council: INCOMING }), NOW)).toHaveLength(1);
    });
  });
});

describe("animationEventKey", () => {
  it("names an event by kind, schedule and member, so replaying one is recognisable", () => {
    const events: AnimationEvent[] = [
      { kind: "proposed", scheduleId: "0.0.1", at: ago(1) },
      { kind: "approved", scheduleId: "0.0.1", memberKey: BOB, at: ago(1) },
      { kind: "reverted", scheduleId: "0.0.1", at: ago(1), result: "CONTRACT_REVERT_EXECUTED" },
      { kind: "councilChanged", scheduleId: null, at: null, council: COUNCIL },
    ];

    expect(events.map(animationEventKey)).toEqual([
      "proposed:0.0.1:",
      `approved:0.0.1:${BOB}`,
      "reverted:0.0.1:",
      `councilChanged::2/${ALICE},${BOB},${CAROL}`,
    ]);
  });

  it("does not depend on when the event was read", () => {
    const first: AnimationEvent = { kind: "approved", scheduleId: "0.0.1", memberKey: BOB, at: ago(9) };

    expect(animationEventKey(first)).toBe(animationEventKey({ ...first, at: ago(2) }));
  });
});
