import { createQueryWrapper } from "./testUtils";
import { useRegistryRoles } from "./useRegistryRoles";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHederaRpcUrl } from "~~/utils/scaffold-hbar/networks";

const fetchRegistryRoles = vi.hoisted(() => vi.fn());
vi.mock("@sh/core/governance/roles", () => ({ fetchRegistryRoles }));

beforeEach(() => fetchRegistryRoles.mockReset());

describe("useRegistryRoles", () => {
  it("reads the executor's roles through the relay of the given network", async () => {
    fetchRegistryRoles.mockResolvedValue({ executors: [], proposerAdmins: [], executorAdmins: [] });
    const { result } = renderHook(() => useRegistryRoles({ executorContractId: "0.0.5000", network: "testnet" }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fetchRegistryRoles).toHaveBeenCalledWith({
      executorContractId: "0.0.5000",
      rpcUrl: getHederaRpcUrl("testnet"),
    });
  });

  it("reads nothing without an executor", () => {
    renderHook(() => useRegistryRoles({ executorContractId: "", network: "testnet" }), {
      wrapper: createQueryWrapper(),
    });
    expect(fetchRegistryRoles).not.toHaveBeenCalled();
  });
});
