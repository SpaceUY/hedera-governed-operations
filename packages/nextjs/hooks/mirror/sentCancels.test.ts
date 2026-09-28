import { CANCEL_CONFIRMATION_WINDOW_MS, inboxWhileAwaitingCancels, readWhileAwaitingCancel } from "./sentCancels";
import type { Proposal, ProposalInbox } from "@sh/core/governance/proposals";
import type { RegistryCrossCheck } from "@sh/core/governance/registry";
import { describe, expect, it } from "vitest";

const SENT_AT = 1_000_000;

const reading = (proposalId: number, state: "pending" | "cancelled" | "executed") =>
  ({
    status: "read",
    entry: { proposalId, state, target: "0x0", proposer: "0x0", calldata: "0x", operation: {} },
  }) as unknown as RegistryCrossCheck;

const stateOf = (read: RegistryCrossCheck) => (read.status === "read" ? read.entry.state : read.status);

describe("readWhileAwaitingCancel", () => {
  it("reads a pending entry as cancelled while the cancel is unconfirmed", () => {
    expect(stateOf(readWhileAwaitingCancel(reading(7, "pending"), SENT_AT, SENT_AT + 1))).toBe("cancelled");
  });

  it("believes a pending entry once the window is over, since the cancel did not take", () => {
    const read = reading(7, "pending");
    expect(readWhileAwaitingCancel(read, SENT_AT, SENT_AT + CANCEL_CONFIRMATION_WINDOW_MS)).toBe(read);
  });

  it("returns any other answer as it came", () => {
    const executed = reading(7, "executed");
    const unreachable = { status: "unreachable", reason: "timeout" } as RegistryCrossCheck;
    expect(readWhileAwaitingCancel(executed, SENT_AT, SENT_AT + 1)).toBe(executed);
    expect(readWhileAwaitingCancel(unreachable, SENT_AT, SENT_AT + 1)).toBe(unreachable);
  });

  it("leaves an entry nobody sent a cancel for alone", () => {
    const read = reading(7, "pending");
    expect(readWhileAwaitingCancel(read, undefined, SENT_AT)).toBe(read);
  });
});

describe("inboxWhileAwaitingCancels", () => {
  const inbox = {
    proposals: [
      { registry: reading(7, "pending") },
      { registry: reading(8, "pending") },
      { registry: { status: "notApplicable" } },
    ] as unknown as Proposal[],
    unreachableProposers: [],
  } as ProposalInbox;

  it("reads only the entries with an unconfirmed cancel as cancelled", () => {
    const shown = inboxWhileAwaitingCancels(inbox, { 7: SENT_AT }, SENT_AT + 1);
    expect(shown.proposals.map(proposal => stateOf(proposal.registry))).toEqual([
      "cancelled",
      "pending",
      "notApplicable",
    ]);
  });

  it("hands the inbox back untouched when no cancel is waiting", () => {
    expect(inboxWhileAwaitingCancels(inbox, {}, SENT_AT)).toBe(inbox);
  });
});
