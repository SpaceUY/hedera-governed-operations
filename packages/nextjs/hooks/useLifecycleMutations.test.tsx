import { useCancelProposal } from "./useCancelProposal";
import { useSignProposal } from "./useSignProposal";
import { ScheduleDeleteRefusedError, useWithdrawProposal } from "./useWithdrawProposal";
import { type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
}));
// Poll without waiting, so the not-yet-indexed path runs at test speed.
vi.mock("~~/utils/scaffold-hbar/waitForMirrorIndexing", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/utils/scaffold-hbar/waitForMirrorIndexing")>()),
  MIRROR_INDEXING_RETRY_DELAYS_MS: [0, 0],
}));

/** The Mirror row a ScheduleDelete leaves, with the result consensus gave it. */
const deleteRow = (result: string) => [{ name: "SCHEDULEDELETE", result }] as unknown as MirrorTransaction[];

const SCHEDULE_ID = "0.0.10714227";
const EXECUTOR_CONTRACT_ID = "0.0.10671250";

describe("useSignProposal", () => {
  it("signs the given schedule", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction } as never);

    const { result } = renderHook(() => useSignProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: expect.anything() }));
  });
});

describe("useWithdrawProposal", () => {
  const withdrawWith = (rows: MirrorTransaction[] | null) => {
    vi.mocked(useHederaSigner).mockReturnValue({
      executeTransaction: vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" }),
    } as never);
    vi.mocked(fetchTransaction).mockReset();
    if (rows) vi.mocked(fetchTransaction).mockResolvedValue(rows);
    else vi.mocked(fetchTransaction).mockResolvedValue([]);
    const { result } = renderHook(() => useWithdrawProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);
    return result;
  };

  it("deletes the given schedule", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction } as never);
    vi.mocked(fetchTransaction).mockResolvedValue(deleteRow("SUCCESS"));

    const { result } = renderHook(() => useWithdrawProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: expect.anything() }));
    const txArg = executeTransaction.mock.calls[0][0];
    expect(txArg.scheduleId?.toString()).toBe(SCHEDULE_ID);
    expect(fetchTransaction).toHaveBeenCalledWith("0.0.1@1.0", expect.anything());
  });

  it("fails when the network refused the delete at consensus, since the schedule is still live", async () => {
    const result = withdrawWith(deleteRow("INVALID_SIGNATURE"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ScheduleDeleteRefusedError);
    expect(result.current.error?.message).toContain("INVALID_SIGNATURE");
  });

  it("counts a schedule another delete already removed as withdrawn", async () => {
    const result = withdrawWith(deleteRow("SCHEDULE_ALREADY_DELETED"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("fails, naming the transaction, when Mirror never shows the delete", async () => {
    const result = withdrawWith(null);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/0\.0\.1@1\.0.*not confirmed/);
  });
});

describe("useCancelProposal", () => {
  it("cancels the given registry proposal", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction } as never);

    const { result } = renderHook(() => useCancelProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, registryProposalId: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ contractId: expect.anything() }));
    const txArg = executeTransaction.mock.calls[0][0];
    expect(txArg.contractId?.toString()).toBe(EXECUTOR_CONTRACT_ID);
  });
});
