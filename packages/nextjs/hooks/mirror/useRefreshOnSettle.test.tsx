import type { ReactNode } from "react";
import { DEFAULT_PENDING_POLL_MS } from "./mirrorQuery";
import { councilQueryKey } from "./useCouncil";
import { type SettleScope, useRefreshOnSettle } from "./useRefreshOnSettle";
import { treasuryFiguresQueryKey } from "./useTreasuryFigures";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCOPE: SettleScope = { network: "testnet", governanceAccountId: "0.0.100", executorContractId: "0.0.200" };
const TREASURY_KEY = treasuryFiguresQueryKey("testnet", "0.0.100");
const COUNCIL_KEY = councilQueryKey("testnet", "0.0.100", "0.0.200");

/** Only the fields the hook reads; the rest of a `Proposal` does not decide anything here. */
const proposal = (scheduleId: string, status: ScheduleStatus, kind = "treasuryTransfer") =>
  ({
    schedule: { schedule_id: scheduleId },
    state: { status, isSettled: status !== "pending" },
    operation: { kind },
  }) as unknown as Proposal;

let queryClient: QueryClient;

const render = (initial: readonly Proposal[] | undefined) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ proposals }) => useRefreshOnSettle(proposals, SCOPE), {
    wrapper: Wrapper,
    initialProps: { proposals: initial },
  });
};

const invalidatedKeys = () =>
  vi.mocked(queryClient.invalidateQueries).mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey);

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient();
  vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useRefreshOnSettle", () => {
  it("invalidates the treasury when a proposal leaves pending, now and once more a poll later", () => {
    const { rerender } = render([proposal("0.0.1", "pending")]);

    rerender({ proposals: [proposal("0.0.1", "executed")] });
    expect(invalidatedKeys()).toEqual([TREASURY_KEY]);

    vi.advanceTimersByTime(DEFAULT_PENDING_POLL_MS);
    expect(invalidatedKeys()).toEqual([TREASURY_KEY, TREASURY_KEY]);
  });

  it("only seeds on the first data, even when it already holds settled proposals", () => {
    const { rerender } = render(undefined);
    rerender({ proposals: [proposal("0.0.1", "executed"), proposal("0.0.2", "pending")] });
    rerender({ proposals: [proposal("0.0.1", "executed"), proposal("0.0.2", "pending")] });
    vi.advanceTimersByTime(DEFAULT_PENDING_POLL_MS);

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("does not fire again for a proposal that stays settled, or for one that appears already settled", () => {
    const { rerender } = render([proposal("0.0.1", "pending")]);
    rerender({ proposals: [proposal("0.0.1", "deleted")] });
    rerender({ proposals: [proposal("0.0.1", "deleted"), proposal("0.0.2", "expired")] });

    expect(invalidatedKeys()).toEqual([TREASURY_KEY]);
  });

  it("also invalidates the council when the settled proposal is a council rotation", () => {
    const { rerender } = render([proposal("0.0.1", "pending", "councilRotation")]);

    rerender({ proposals: [proposal("0.0.1", "executed", "councilRotation")] });

    expect(invalidatedKeys()).toEqual([TREASURY_KEY, COUNCIL_KEY]);
  });

  it("clears the delayed read when it unmounts first", () => {
    const { rerender, unmount } = render([proposal("0.0.1", "pending")]);
    rerender({ proposals: [proposal("0.0.1", "executed")] });
    unmount();

    vi.advanceTimersByTime(DEFAULT_PENDING_POLL_MS);

    expect(invalidatedKeys()).toEqual([TREASURY_KEY]);
  });

  it("matches the queries the treasury and council hooks actually use", () => {
    vi.mocked(queryClient.invalidateQueries).mockRestore();
    queryClient.setQueryData(treasuryFiguresQueryKey("testnet", "0.0.100", "0.0.300", "0.0.400", "0.0.500"), {});
    queryClient.setQueryData(COUNCIL_KEY, {});
    const { rerender } = render([proposal("0.0.1", "pending", "councilRotation")]);

    rerender({ proposals: [proposal("0.0.1", "executed", "councilRotation")] });

    const queries = queryClient.getQueryCache().findAll();
    expect(queries).toHaveLength(2);
    expect(queries.every(query => query.state.isInvalidated)).toBe(true);
  });
});
