// @vitest-environment node
import { decodeScheduledOperation } from "./decode";
import { scheduledBodyOf } from "./scheduledBody";
import { AccountId, Hbar, TransferTransaction } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";

const TREASURY = "0.0.10671146";
const RECIPIENT = "0.0.500";

const transfer = (tinybars: number) =>
  new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(TREASURY), Hbar.fromTinybars(-tinybars))
    .addHbarTransfer(AccountId.fromString(RECIPIENT), Hbar.fromTinybars(tinybars));

describe("scheduledBodyOf", () => {
  it("produces a body the decoder reads back as the same transfer", () => {
    const operation = decodeScheduledOperation(scheduledBodyOf(transfer(150_000_000)));

    expect(operation.kind).toBe("treasuryTransfer");
    if (operation.kind !== "treasuryTransfer") return;
    expect(operation.hbar).toEqual(
      expect.arrayContaining([
        { accountId: TREASURY, tinybars: -150_000_000n },
        { accountId: RECIPIENT, tinybars: 150_000_000n },
      ]),
    );
  });

  it("does not depend on Node's Buffer", () => {
    const original = globalThis.Buffer;
    // @ts-expect-error simulating the browser bundle, which has no Buffer
    delete globalThis.Buffer;
    try {
      expect(scheduledBodyOf(transfer(1))).toMatch(/^[A-Za-z0-9+/]+=*$/);
    } finally {
      globalThis.Buffer = original;
    }
  });
});
