import { useCancelProposalFlow } from "./useCancelProposalFlow";
import { ScheduleDeleteRefusedError } from "./useWithdrawProposal";
import { type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const SCHEDULE_ID = "0.0.10765804";
const EXECUTOR_CONTRACT_ID = "0.0.10746059";
const LIVE = { scheduleId: SCHEDULE_ID, executorContractId: EXECUTOR_CONTRACT_ID };
const ENTRY_ID = 3;

/** What each wallet call was: a ScheduleDelete names a schedule, the cancel a contract. */
const sent = (executeTransaction: ReturnType<typeof vi.fn>) =>
  executeTransaction.mock.calls.map(([tx]) => (tx.scheduleId ? "delete" : "cancel"));

const rejection = Object.assign(new Error("User rejected"), { code: 5000 });

let executeTransaction: ReturnType<typeof vi.fn>;
let callbacks: { onWithdrawn: ReturnType<typeof vi.fn>; onCancelled: ReturnType<typeof vi.fn> };

beforeEach(() => {
  executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
  vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction } as never);
  callbacks = { onWithdrawn: vi.fn(), onCancelled: vi.fn() };
  vi.mocked(fetchTransaction).mockReset().mockResolvedValue(deleteRow("SUCCESS"));
});

function renderFlow(withdrawFirst: boolean, queryClient = new QueryClient()) {
  return renderHook(
    () => useCancelProposalFlow({ ...LIVE, plan: { registryProposalId: ENTRY_ID, withdrawFirst } }, callbacks),
    {
      wrapper: createQueryWrapper(queryClient),
    },
  );
}

describe("useCancelProposalFlow", () => {
  it("deletes the live schedule, then cancels the entry, in that order", async () => {
    const { result } = renderFlow(true);
    await act(() => result.current.start());

    expect(sent(executeTransaction)).toEqual(["delete", "cancel"]);
    expect(executeTransaction.mock.calls[0][0].scheduleId.toString()).toBe(SCHEDULE_ID);
    expect(executeTransaction.mock.calls[1][0].contractId.toString()).toBe(EXECUTOR_CONTRACT_ID);
    await waitFor(() => expect(result.current.step).toBe("cancelled"));
    expect(callbacks.onCancelled).toHaveBeenCalledOnce();
    expect(callbacks.onWithdrawn).toHaveBeenCalledOnce();
  });

  it("sends the cancel alone when no schedule is live", async () => {
    const { result } = renderFlow(false);
    await act(() => result.current.start());

    expect(sent(executeTransaction)).toEqual(["cancel"]);
    expect(callbacks.onCancelled).toHaveBeenCalledOnce();
    expect(callbacks.onWithdrawn).not.toHaveBeenCalled();
  });

  it("sends nothing when there is no registry entry to cancel", async () => {
    const { result } = renderHook(() => useCancelProposalFlow({ ...LIVE, plan: null }, callbacks), {
      wrapper: createQueryWrapper(new QueryClient()),
    });
    await act(() => result.current.start());

    expect(executeTransaction).not.toHaveBeenCalled();
    expect(result.current.step).toBe("idle");
  });

  it("stops after a rejected delete, having changed nothing", async () => {
    executeTransaction.mockRejectedValueOnce(rejection);
    const { result } = renderFlow(true);
    await act(() => result.current.start());

    expect(sent(executeTransaction)).toEqual(["delete"]);
    await waitFor(() => expect(result.current.error).toBe(rejection));
    expect(result.current.step).toBe("idle");
    expect(callbacks.onWithdrawn).not.toHaveBeenCalled();
    expect(callbacks.onCancelled).not.toHaveBeenCalled();
  });

  it("says the schedule is withdrawn but the entry is not cancelled when step 2 is rejected, and resumes at step 2", async () => {
    executeTransaction.mockResolvedValueOnce({ transactionId: "0.0.1@1.0" }).mockRejectedValueOnce(rejection);
    const { result } = renderFlow(true);
    await act(() => result.current.start());

    await waitFor(() => expect(result.current.step).toBe("withdrawnNotCancelled"));
    expect(result.current.error).toBe(rejection);
    expect(callbacks.onWithdrawn).toHaveBeenCalledOnce();
    expect(callbacks.onCancelled).not.toHaveBeenCalled();

    await act(() => result.current.start());
    expect(sent(executeTransaction)).toEqual(["delete", "cancel", "cancel"]);
    await waitFor(() => expect(result.current.step).toBe("cancelled"));
  });

  it("sends no cancel after a delete the network refused, and leaves the schedule to withdraw again", async () => {
    vi.mocked(fetchTransaction).mockResolvedValue(deleteRow("INVALID_SIGNATURE"));
    const { result } = renderFlow(true);
    await act(() => result.current.start());

    expect(sent(executeTransaction)).toEqual(["delete"]);
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ScheduleDeleteRefusedError));
    expect(result.current.step).toBe("idle");
    expect(callbacks.onWithdrawn).not.toHaveBeenCalled();
    expect(callbacks.onCancelled).not.toHaveBeenCalled();
  });

  it("waits for the delete to be confirmed before asking for the cancel", async () => {
    let answer: (rows: MirrorTransaction[]) => void = () => undefined;
    vi.mocked(fetchTransaction).mockReturnValue(new Promise(resolve => (answer = resolve)));
    const { result } = renderFlow(true);
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });

    await waitFor(() => expect(result.current.step).toBe("confirmingWithdraw"));
    expect(sent(executeTransaction)).toEqual(["delete"]);

    await act(async () => {
      answer(deleteRow("SUCCESS"));
      await started;
    });
    expect(sent(executeTransaction)).toEqual(["delete", "cancel"]);
    await waitFor(() => expect(result.current.step).toBe("cancelled"));
  });

  it("remembers a deleted schedule across a remount, so a retry never deletes it again", async () => {
    const queryClient = new QueryClient();
    executeTransaction.mockResolvedValueOnce({ transactionId: "0.0.1@1.0" }).mockRejectedValueOnce(new Error("boom"));
    const first = renderFlow(true, queryClient);
    await act(() => first.result.current.start());
    first.unmount();

    // Mirror still reports the schedule live, so the plan still says to withdraw first.
    const second = renderFlow(true, queryClient);
    expect(second.result.current.step).toBe("withdrawnNotCancelled");
    await act(() => second.result.current.start());
    expect(sent(executeTransaction)).toEqual(["delete", "cancel", "cancel"]);
  });
});
