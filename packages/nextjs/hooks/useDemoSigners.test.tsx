import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useDemoSign, useDemoSignatureSent, useDemoSigners } from "./useDemoSigners";
import { QueryClient, partialMatchKey } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, jsonResponse } from "~~/hooks/mirror/testUtils";

const ALICE = { name: "alice", accountId: "0.0.11", publicKey: "QUxJQ0U=" } as const;
const fetchMock = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("useDemoSigners", () => {
  it("asks the server for its demo co-signers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ members: [ALICE] }));
    const { result } = renderHook(() => useDemoSigners(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([ALICE]));
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/signers");
  });

  it("answers an empty list when the server signs for nobody", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ members: [], unavailableReason: "No co-signing agent is configured" }));
    const { result } = renderHook(() => useDemoSigners(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("asks once: a server that cannot be reached is not retried on every render", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useDemoSigners(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useDemoSign", () => {
  it("records a demo signature under its own key with the member's key, and sends the server only the request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    const client = new QueryClient();
    const { result } = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper(client) });

    await act(() =>
      result.current.mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey }),
    );

    const [mutation] = client.getMutationCache().getAll();
    expect(mutation.options.mutationKey).toEqual(GOVERNANCE_MUTATION_KEYS.signAs);
    expect(mutation.state.variables).toEqual({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ scheduleId: "0.0.9001", member: "alice" });
  });

  it("is not matched by the wallet signature's key, so the sign filters never pick it up", () => {
    expect(partialMatchKey([...GOVERNANCE_MUTATION_KEYS.signAs], [...GOVERNANCE_MUTATION_KEYS.sign])).toBe(false);
  });
});

describe("useDemoSignatureSent", () => {
  const sentFor = (client: QueryClient, scheduleId: string, memberKey: string) =>
    renderHook(() => useDemoSignatureSent(scheduleId, memberKey), { wrapper: createQueryWrapper(client) });

  it("knows a signature sent from this session for that schedule and seat only, and not one that failed", async () => {
    const client = new QueryClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ transactionId: "0.0.11@1.1" }));
    const { result } = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper(client) });
    await act(() =>
      result.current.mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey }),
    );

    expect(sentFor(client, "0.0.9001", ALICE.publicKey).result.current).toBe(true);
    expect(sentFor(client, "0.0.9002", ALICE.publicKey).result.current).toBe(false);
    expect(sentFor(client, "0.0.9001", "Qk9C").result.current).toBe(false);

    const failing = new QueryClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "no" }, 409));
    const second = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper(failing) });
    await act(() =>
      second.result.current
        .mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey })
        .catch(() => undefined),
    );
    expect(sentFor(failing, "0.0.9001", ALICE.publicKey).result.current).toBe(false);
  });
});
