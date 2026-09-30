import { useCouncilBefore } from "./useCouncilBefore";
import { fetchCouncilKeyBefore } from "@sh/core/governance/council";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";

vi.mock("@sh/core/governance/council", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/governance/council")>()),
  fetchCouncilKeyBefore: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("useCouncilBefore", () => {
  it("reads nothing without an execution time", () => {
    renderHook(
      () => useCouncilBefore({ governanceAccountId: "0.0.4000", executedTimestamp: null, network: "testnet" }),
      { wrapper: createQueryWrapper() },
    );
    expect(fetchCouncilKeyBefore).not.toHaveBeenCalled();
  });

  it("reads the council just before the execution", async () => {
    vi.mocked(fetchCouncilKeyBefore).mockResolvedValue({ threshold: 2, memberKeys: ["a", "b", "c"] });
    const { result } = renderHook(
      () => useCouncilBefore({ governanceAccountId: "0.0.4000", executedTimestamp: "1.5", network: "testnet" }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.data?.threshold).toBe(2));
    expect(fetchCouncilKeyBefore).toHaveBeenCalledWith("0.0.4000", "1.5", "testnet");
  });
});
