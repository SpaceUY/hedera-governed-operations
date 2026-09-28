import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useProposalLookup } from "./useProposalLookup";
import { proto } from "@hiero-ledger/proto";
import { PrivateKey } from "@hiero-ledger/sdk";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import Long from "long";
import { afterEach, describe, expect, it, vi } from "vitest";
import recorded from "~~/services/governance/__fixtures__/scheduled-bodies.json";
import { fetchRegistryEntries } from "~~/services/governance/registry";
import { fetchAccount, fetchSchedule } from "~~/services/mirror";
import revertedSchedule from "~~/services/mirror/__fixtures__/schedule-reverted.json";
import rowsAtRevert from "~~/services/mirror/__fixtures__/transactions-at-reverted.json";

vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchSchedule: vi.fn(),
  fetchAccount: vi.fn(),
}));

// The proposer list comes from the JSON-RPC relay, which viem cannot reach under jsdom (and which
// this hook never reads); stub it the same way useProposals.test.tsx does, leaving fetchCouncilKey
// real so it still exercises the actual threshold-key decode against the mocked fetchAccount above.
vi.mock("~~/services/governance/council", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/governance/council")>()),
  fetchProposerAccountIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("~~/services/governance/registry", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/governance/registry")>()),
  fetchRegistryEntries: vi.fn(),
}));

const GOVERNANCE_ACCOUNT_ID = "0.0.10671146";
const EXECUTOR_CONTRACT_ID = "0.0.10671250";
/** The real testnet 2-of-3 fixture, reused from council.test.ts. */
const RECORDED_THRESHOLD_KEY_HEX =
  "2a730802126f0a233a210317f4a36e88217ef559aae2316440abc651a4af39726b99b1e40c649b6fa9cf160a233a21022eb093a258007c08d579112a907376fce7f5d0ed4163167bc1e3606c5c6a0dea0a233a2102291d71237840449a21ede1386c5579a56491291bc02d75408c46695e1144eb10";

const baseSchedule = {
  schedule_id: "0.0.777",
  creator_account_id: "0.0.111",
  payer_account_id: GOVERNANCE_ACCOUNT_ID,
  consensus_timestamp: "0",
  executed_timestamp: null,
  expiration_time: null,
  deleted: false,
  memo: "",
  wait_for_expiry: false,
  admin_key: null,
  signatures: [] as never[],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(fetchSchedule).mockReset();
  vi.mocked(fetchAccount).mockReset();
  vi.mocked(fetchRegistryEntries).mockReset();
});

const lookup = (executorContractId = EXECUTOR_CONTRACT_ID) =>
  renderHook(
    () => useProposalLookup({ governanceAccountId: GOVERNANCE_ACCOUNT_ID, executorContractId, scheduleId: "0.0.777" }),
    { wrapper: createQueryWrapper() },
  );

describe("useProposalLookup", () => {
  it("decodes an unrecognized body without crashing, with no registry check attempted", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ProtobufEncoded", key: RECORDED_THRESHOLD_KEY_HEX },
    } as never);
    vi.mocked(fetchSchedule).mockResolvedValue({ ...baseSchedule, transaction_body: "" } as never);

    const { result } = renderHook(
      () =>
        useProposalLookup({
          governanceAccountId: GOVERNANCE_ACCOUNT_ID,
          executorContractId: EXECUTOR_CONTRACT_ID,
          scheduleId: "0.0.777",
        }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.proposal?.operation.kind).toBe("unrecognized");
    expect(result.current.proposal?.registry).toEqual({ status: "notApplicable" });
  });

  it("reports incoming progress for a council-rotation schedule", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ProtobufEncoded", key: RECORDED_THRESHOLD_KEY_HEX },
    } as never);

    const incomingKeys = [PrivateKey.generateECDSA(), PrivateKey.generateECDSA()].map(key =>
      key.publicKey.toBytesRaw(),
    );
    const body = proto.SchedulableTransactionBody.encode({
      cryptoUpdateAccount: {
        accountIDToUpdate: { accountNum: Long.fromNumber(10671146) },
        key: { thresholdKey: { threshold: 2, keys: { keys: incomingKeys.map(bytes => ({ ECDSASecp256k1: bytes })) } } },
      },
    }).finish();

    vi.mocked(fetchSchedule).mockResolvedValue({
      ...baseSchedule,
      signatures: [{ public_key_prefix: Buffer.from(incomingKeys[0]).toString("base64") } as never],
      transaction_body: Buffer.from(body).toString("base64"),
    } as never);

    const { result } = renderHook(
      () =>
        useProposalLookup({
          governanceAccountId: GOVERNANCE_ACCOUNT_ID,
          executorContractId: EXECUTOR_CONTRACT_ID,
          scheduleId: "0.0.777",
        }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.proposal?.incomingProgress?.signed).toBe(1));
    expect(result.current.proposal?.registry).toEqual({ status: "notApplicable" });
  });

  it("refuses a schedule the governance account does not pay for", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ProtobufEncoded", key: RECORDED_THRESHOLD_KEY_HEX },
    } as never);
    vi.mocked(fetchSchedule).mockResolvedValue({
      ...baseSchedule,
      payer_account_id: "0.0.424242",
      transaction_body: recorded.registryCall.transactionBody,
    } as never);

    const { result } = lookup();

    await waitFor(() => expect(result.current.error?.message).toMatch(/not a governance proposal/));
    expect(result.current.proposal).toBeUndefined();
    expect(fetchRegistryEntries).not.toHaveBeenCalled();
  });

  it("still reads the registry entry once the schedule was deleted, so the proposer can cancel it", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ProtobufEncoded", key: RECORDED_THRESHOLD_KEY_HEX },
    } as never);
    vi.mocked(fetchSchedule).mockResolvedValue({
      ...baseSchedule,
      deleted: true,
      transaction_body: recorded.registryCall.transactionBody,
    } as never);
    vi.mocked(fetchRegistryEntries).mockResolvedValue(
      new Map([
        [
          7,
          {
            status: "read",
            entry: {
              proposalId: 7,
              state: "pending",
              target: "0x1111111111111111111111111111111111111111",
              calldata: "0x",
              operation: { kind: "unrecognized", target: "0x11", calldata: "0x", reason: "test" },
            },
          },
        ],
      ]),
    );

    // The recorded body names executor 0.0.10671156.
    const { result } = lookup("0.0.10671156");

    await waitFor(() => expect(result.current.proposal?.registry.status).toBe("read"));
    expect(result.current.proposal?.state.status).toBe("deleted");
  });

  it("still reads the registry entry once the schedule ran and failed, since the revert left it pending", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ProtobufEncoded", key: RECORDED_THRESHOLD_KEY_HEX },
    } as never);
    vi.mocked(fetchSchedule).mockResolvedValue({
      ...baseSchedule,
      executed_timestamp: revertedSchedule.executed_timestamp,
      transaction_body: recorded.registryCall.transactionBody,
    } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(rowsAtRevert)));
    vi.mocked(fetchRegistryEntries).mockResolvedValue(
      new Map([[7, { status: "read", entry: { proposalId: 7, state: "pending" } } as never]]),
    );

    const { result } = lookup("0.0.10671156");

    await waitFor(() => expect(result.current.proposal?.registry.status).toBe("read"));
    expect(result.current.proposal?.execution).toMatchObject({ status: "failed", result: "CONTRACT_REVERT_EXECUTED" });
  });

  it("drops the delayed re-read once the page is gone", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(fetchSchedule).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchAccount).mockReturnValue(new Promise(() => {}));
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    const { result, unmount } = lookup();
    act(() => result.current.refresh());
    const immediateReads = invalidate.mock.calls.length;
    unmount();
    vi.runAllTimers();

    expect(immediateReads).toBeGreaterThan(0);
    expect(invalidate).toHaveBeenCalledTimes(immediateReads);
    invalidate.mockRestore();
  });
});
