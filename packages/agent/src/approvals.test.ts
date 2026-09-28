import { CONFIRMATION_TTL_MS, createApprovalStore } from "./approvals";
import { TOTP_STEP_SECONDS, decodeBase32, totpCode, totpStepAt } from "./totp";
import { describe, expect, it } from "vitest";

const SECRET = decodeBase32("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");

const UPGRADE = "0.0.9001";
const TRANSFER = "0.0.9002";

const NOW = new Date("2026-09-28T10:00:00.000Z");

const later = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);

const codeAt = (at: Date): string => totpCode(SECRET, totpStepAt(at));

describe("a proposal nobody has confirmed", () => {
  it("is not released by the store on its own", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);

    expect(store.confirmed(NOW).has(UPGRADE)).toBe(false);
  });

  it("is released by a valid code", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);

    expect(store.confirm(UPGRADE, codeAt(NOW), NOW)).toBe("confirmed");
    expect(store.confirmed(NOW).has(UPGRADE)).toBe(true);
  });

  it("stays unreleased on a code the clock does not match", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);

    expect(store.confirm(UPGRADE, "000000", NOW)).toBe("rejected");
    expect(store.confirmed(NOW).has(UPGRADE)).toBe(false);
  });

  it("is recorded once however many passes see it waiting", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.confirm(UPGRADE, codeAt(NOW), NOW);
    store.awaitConfirmation(UPGRADE);

    expect(store.confirmed(NOW).has(UPGRADE)).toBe(true);
  });
});

describe("a code for a proposal the agent is not waiting on", () => {
  it("is unknown rather than rejected, since the two are different things to tell an operator", () => {
    const store = createApprovalStore(SECRET);

    expect(store.confirm(UPGRADE, codeAt(NOW), NOW)).toBe("unknown");
  });

  it("does not spend the code, which the proposal it was meant for still needs", () => {
    const store = createApprovalStore(SECRET);
    store.confirm(TRANSFER, codeAt(NOW), NOW);
    store.awaitConfirmation(UPGRADE);

    expect(store.confirm(UPGRADE, codeAt(NOW), NOW)).toBe("confirmed");
  });
});

describe("replaying a code", () => {
  it("cannot release a second proposal inside the same step", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.awaitConfirmation(TRANSFER);
    const code = codeAt(NOW);

    expect(store.confirm(UPGRADE, code, NOW)).toBe("confirmed");
    expect(store.confirm(TRANSFER, code, NOW)).toBe("rejected");
  });

  it("cannot release one with the step before the last accepted, either", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.awaitConfirmation(TRANSFER);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    expect(store.confirm(TRANSFER, codeAt(later(-TOTP_STEP_SECONDS)), NOW)).toBe("rejected");
  });

  it("stops being a replay once the clock moves to the next step", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.awaitConfirmation(TRANSFER);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    const next = later(TOTP_STEP_SECONDS);
    expect(store.confirm(TRANSFER, codeAt(next), next)).toBe("confirmed");
  });

  it("says a proposal already released is that, rather than refusing the code", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    const next = later(TOTP_STEP_SECONDS);
    expect(store.confirm(UPGRADE, codeAt(next), next)).toBe("alreadyConfirmed");
  });
});

describe("a confirmation that has been sitting unused", () => {
  const lapsed = new Date(NOW.getTime() + CONFIRMATION_TTL_MS);

  it("stops releasing signatures once its window is over", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    expect(store.confirmed(new Date(lapsed.getTime() - 1)).has(UPGRADE)).toBe(true);
    expect(store.confirmed(lapsed).has(UPGRADE)).toBe(false);
  });

  it("leaves the proposal waiting again, so a fresh code releases it", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    expect(store.confirm(UPGRADE, codeAt(lapsed), lapsed)).toBe("confirmed");
    expect(store.confirmed(lapsed).has(UPGRADE)).toBe(true);
  });
});

describe("a proposal that has left the inbox", () => {
  it("is forgotten, since the agent runs for months and Mirror answers for it now", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    store.forgetOutside(new Set([TRANSFER]));

    expect(store.confirmed(NOW).has(UPGRADE)).toBe(false);
    expect(store.confirm(UPGRADE, codeAt(later(TOTP_STEP_SECONDS)), NOW)).toBe("unknown");
  });

  it("keeps the ones still in it", () => {
    const store = createApprovalStore(SECRET);
    store.awaitConfirmation(UPGRADE);
    store.confirm(UPGRADE, codeAt(NOW), NOW);

    store.forgetOutside(new Set([UPGRADE, TRANSFER]));

    expect(store.confirmed(NOW).has(UPGRADE)).toBe(true);
  });
});
