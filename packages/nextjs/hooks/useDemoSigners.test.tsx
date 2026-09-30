import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useDemoSign, useDemoSignaturePending, useDemoSignatureState, useDemoSigners } from "./useDemoSigners";
import { ScheduleSignRefusedError } from "./useSignProposal";
import { type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import { QueryClient, partialMatchKey } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, jsonResponse } from "~~/hooks/mirror/testUtils";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
}));
// Poll without waiting, so the not-yet-indexed path runs at test speed.
vi.mock("~~/utils/scaffold-hbar/waitForMirrorIndexing", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/utils/scaffold-hbar/waitForMirrorIndexing")>()),
  MIRROR_INDEXING_RETRY_DELAYS_MS: [0, 0],
}));

/** The Mirror row a ScheduleSign leaves, with the result consensus gave it. */
const signRow = (result: string) => [{ name: "SCHEDULESIGN", result }] as unknown as MirrorTransaction[];

const ALICE = { name: "alice", accountId: "0.0.11", publicKey: "QUxJQ0U=" } as const;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(fetchTransaction).mockReset().mockResolvedValue(signRow("SUCCESS"));
});
afterEach(() => {
  vi.useRealTimers();
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

  describe("how long an answer stands", () => {
    const answered = async (members: unknown[]) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      fetchMock.mockResolvedValue(jsonResponse({ members }));
      const hook = renderHook(() => useDemoSigners(), { wrapper: createQueryWrapper() });
      await waitFor(() => expect(hook.result.current.data).toEqual(members));
      return hook;
    };

    it("asks again after a while when the server signed for nobody, so a fixed server needs no reload", async () => {
      const { result, rerender } = await answered([]);
      expect(result.current.isStale).toBe(false);

      vi.setSystemTime(Date.now() + 31_000);
      rerender();
      expect(result.current.isStale).toBe(true);
    });

    it("never asks again once it has members", async () => {
      const { result, rerender } = await answered([ALICE]);

      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
      rerender();
      expect(result.current.isStale).toBe(false);
    });
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

  it("succeeds only once Mirror lists the signature the server sent, then re-reads the inbox", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    vi.mocked(fetchTransaction).mockReset().mockResolvedValueOnce([]).mockResolvedValue(signRow("SUCCESS"));
    const client = new QueryClient();
    const refetch = vi.spyOn(client, "refetchQueries");
    const { result } = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper(client) });

    await act(() =>
      result.current.mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey }),
    );

    expect(fetchTransaction).toHaveBeenCalledTimes(2);
    expect(fetchTransaction).toHaveBeenCalledWith("0.0.11@1.1", expect.anything());
    expect(refetch).toHaveBeenCalledWith({ queryKey: proposalInboxQueryKey("testnet") });
  });

  it("says the network refused the signature, with its result", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    vi.mocked(fetchTransaction).mockReset().mockResolvedValue(signRow("NO_NEW_VALID_SIGNATURES"));
    const { result } = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper() });

    const sending = result.current.mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey });

    await expect(sending).rejects.toBeInstanceOf(ScheduleSignRefusedError);
    await expect(sending).rejects.toThrow(/NO_NEW_VALID_SIGNATURES/);
  });

  it("is not matched by the wallet signature's key, so the sign filters never pick it up", () => {
    expect(partialMatchKey([...GOVERNANCE_MUTATION_KEYS.signAs], [...GOVERNANCE_MUTATION_KEYS.sign])).toBe(false);
  });
});

describe("useDemoSignatureState", () => {
  const stateOf = (client: QueryClient, scheduleId: string, memberKey: string) =>
    renderHook(() => useDemoSignatureState(scheduleId, memberKey), { wrapper: createQueryWrapper(client) });

  it("says sending while the server has the request and sent once the network took it, for that schedule and seat only", async () => {
    const client = new QueryClient();
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => (release = resolve)));
    const { result } = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper(client) });
    let sending: Promise<unknown> = Promise.resolve();
    act(() => {
      sending = result.current.mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey });
    });

    await waitFor(() => expect(stateOf(client, "0.0.9001", ALICE.publicKey).result.current).toBe("sending"));

    await act(async () => {
      release(jsonResponse({ transactionId: "0.0.11@1.1" }));
      await sending;
    });
    expect(stateOf(client, "0.0.9001", ALICE.publicKey).result.current).toBe("sent");
    expect(stateOf(client, "0.0.9002", ALICE.publicKey).result.current).toBe("none");
    expect(stateOf(client, "0.0.9001", "Qk9C").result.current).toBe("none");
  });

  it("says none after a signature the server refused", async () => {
    const failing = new QueryClient();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "no" }, 409));
    const { result } = renderHook(() => useDemoSign(), { wrapper: createQueryWrapper(failing) });
    await act(() =>
      result.current
        .mutateAsync({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey })
        .catch(() => undefined),
    );
    expect(stateOf(failing, "0.0.9001", ALICE.publicKey).result.current).toBe("none");
  });
});

describe("useDemoSignaturePending", () => {
  it("is true while a demo signature for the schedule is with the server or waiting for Mirror, for that schedule only", async () => {
    const client = new QueryClient();
    let listed: (rows: MirrorTransaction[]) => void = () => undefined;
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    vi.mocked(fetchTransaction)
      .mockReset()
      .mockReturnValue(new Promise(resolve => (listed = resolve)));
    const { result } = renderHook(
      () => ({
        sign: useDemoSign(),
        this: useDemoSignaturePending("0.0.9001"),
        other: useDemoSignaturePending("0.0.9002"),
      }),
      { wrapper: createQueryWrapper(client) },
    );
    expect(result.current.this).toBe(false);

    act(() => result.current.sign.mutate({ scheduleId: "0.0.9001", member: "alice", memberKey: ALICE.publicKey }));

    await waitFor(() => expect(result.current.this).toBe(true));
    expect(result.current.other).toBe(false);
    await waitFor(() => expect(fetchTransaction).toHaveBeenCalled());
    expect(result.current.this).toBe(true);
    await act(async () => listed(signRow("SUCCESS")));
    await waitFor(() => expect(result.current.this).toBe(false));
  });
});
