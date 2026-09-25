import { useCancelProposal } from "./useCancelProposal";
import { useSignProposal } from "./useSignProposal";
import { useWithdrawProposal } from "./useWithdrawProposal";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));

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
  it("deletes the given schedule", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction } as never);

    const { result } = renderHook(() => useWithdrawProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: expect.anything() }));
    const txArg = executeTransaction.mock.calls[0][0];
    expect(txArg.scheduleId?.toString()).toBe(SCHEDULE_ID);
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
