import { MirrorPollStatus, polledAgoLabel } from "./MirrorPollStatus";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";

vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));

describe("polledAgoLabel", () => {
  it("counts whole seconds under a minute", () => {
    expect(polledAgoLabel(10_000, 10_000)).toBe("polled 0s ago");
    expect(polledAgoLabel(10_000, 12_999)).toBe("polled 2s ago");
    expect(polledAgoLabel(10_000, 69_999)).toBe("polled 59s ago");
  });

  it("counts whole minutes from a minute on", () => {
    expect(polledAgoLabel(0, 60_000)).toBe("polled 1m ago");
    expect(polledAgoLabel(0, 185_000)).toBe("polled 3m ago");
  });

  it("never reads a timestamp from a clock that runs behind as the future", () => {
    expect(polledAgoLabel(5_000, 4_000)).toBe("polled 0s ago");
  });
});

describe("MirrorPollStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderStatus = () => {
    const queryClient = new QueryClient();
    render(<MirrorPollStatus />, { wrapper: createQueryWrapper(queryClient) });
    return queryClient;
  };

  it("stays hidden until the inbox has been read", () => {
    renderStatus();
    expect(screen.queryByText(/Mirror Node/)).toBeNull();
  });

  it("ticks every second from the inbox's last read", () => {
    const queryClient = renderStatus();

    act(() => queryClient.setQueryData([...proposalInboxQueryKey("testnet"), "0.0.1"], {}, { updatedAt: 100_000 }));
    expect(screen.getByText("Mirror Node · polled 0s ago")).toBeTruthy();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText("Mirror Node · polled 3s ago")).toBeTruthy();
  });
});
