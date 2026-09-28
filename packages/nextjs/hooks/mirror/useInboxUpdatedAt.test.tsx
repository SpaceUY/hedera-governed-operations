import { createQueryWrapper } from "./testUtils";
import { useInboxUpdatedAt } from "./useInboxUpdatedAt";
import { proposalInboxQueryKey } from "./useProposals";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const inboxKey = (network: string, governanceAccountId: string) => [
  ...proposalInboxQueryKey(network),
  governanceAccountId,
];

const renderWithClient = (network: string) => {
  const queryClient = new QueryClient();
  const hook = renderHook(() => useInboxUpdatedAt(network), { wrapper: createQueryWrapper(queryClient) });
  return { queryClient, hook };
};

describe("useInboxUpdatedAt", () => {
  it("is 0 before any inbox has been read", () => {
    const { hook } = renderWithClient("testnet");
    expect(hook.result.current).toBe(0);
  });

  it("follows the latest read of any inbox on the network", () => {
    const { queryClient, hook } = renderWithClient("testnet");

    act(() => queryClient.setQueryData(inboxKey("testnet", "0.0.1"), { proposals: [] }, { updatedAt: 1_000 }));
    expect(hook.result.current).toBe(1_000);

    act(() => queryClient.setQueryData(inboxKey("testnet", "0.0.2"), { proposals: [] }, { updatedAt: 3_000 }));
    expect(hook.result.current).toBe(3_000);
  });

  it("ignores inboxes on another network and other Mirror reads", () => {
    const { queryClient, hook } = renderWithClient("testnet");

    act(() => {
      queryClient.setQueryData(inboxKey("mainnet", "0.0.1"), { proposals: [] }, { updatedAt: 5_000 });
      queryClient.setQueryData(["mirror", "testnet", "council"], {}, { updatedAt: 6_000 });
    });

    expect(hook.result.current).toBe(0);
  });
});
