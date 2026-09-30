import type { ReactNode } from "react";
import { useOpenSubmitted } from "./GovernanceProvider";
import { SUBMITTED_NOTICE } from "./wizard/copy";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("useOpenSubmitted", () => {
  it("says it was sent, re-reads the inbox, then opens the new proposal on the map", async () => {
    const queryClient = new QueryClient();
    let finishRead: () => void = () => undefined;
    const refetch = vi
      .spyOn(queryClient, "refetchQueries")
      .mockImplementation(() => new Promise<void>(resolve => (finishRead = resolve)));
    const onNotice = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useOpenSubmitted({ network: "testnet", onNotice }), { wrapper });

    let opened: Promise<void> = Promise.resolve();
    act(() => {
      opened = result.current("0.0.901");
    });
    expect(onNotice).toHaveBeenCalledWith(SUBMITTED_NOTICE);
    expect(refetch).toHaveBeenCalledWith({ queryKey: proposalInboxQueryKey("testnet") });
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => {
      finishRead();
      await opened;
    });
    expect(router.push).toHaveBeenCalledWith("/?schedule=0.0.901");
  });
});
