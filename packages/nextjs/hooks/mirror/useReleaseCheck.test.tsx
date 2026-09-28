import { createQueryWrapper } from "./testUtils";
import { useReleaseCheck } from "./useReleaseCheck";
import { checkImplementationAgainstManifest } from "@sh/core/governance/releaseManifest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sh/core/governance/releaseManifest", () => ({ checkImplementationAgainstManifest: vi.fn() }));

const IMPLEMENTATION = "0x00000000000000000000000000000000000B0b00";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useReleaseCheck", () => {
  it("does not read anything when no release topic is configured", async () => {
    const { result } = renderHook(() => useReleaseCheck(IMPLEMENTATION, null), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(checkImplementationAgainstManifest).not.toHaveBeenCalled();
  });

  it("runs the agent's check for the implementation on the configured topic", async () => {
    vi.mocked(checkImplementationAgainstManifest).mockResolvedValue({ matched: true, manifest: {} as never });

    const { result } = renderHook(() => useReleaseCheck(IMPLEMENTATION, "0.0.4242", { network: "testnet" }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(checkImplementationAgainstManifest).toHaveBeenCalledWith(IMPLEMENTATION, "0.0.4242", { network: "testnet" });
  });

  it("surfaces a failed read as an error instead of an answer", async () => {
    vi.mocked(checkImplementationAgainstManifest).mockRejectedValue(new Error("Mirror Node unreachable"));

    const { result } = renderHook(() => useReleaseCheck(IMPLEMENTATION, "0.0.4242"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
