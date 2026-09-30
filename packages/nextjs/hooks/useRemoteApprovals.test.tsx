import { type ReactNode, StrictMode } from "react";
import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useHederaSigner } from "./useHederaSigner";
import { openedScheduleIdOf, signedAsOf, signedScheduleIdOf, useRemoteApprovals } from "./useRemoteApprovals";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationEvent, GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { ALICE, BOB, CAROL, TRANSFER, ago, proposal, world } from "~~/services/liveMap/motion/motionFixtures";

vi.mock("./useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
// The connected account's key: Alice's ("alice" in bytes, as Mirror writes it in hex).
vi.mock("./mirror/useAccount", () => ({
  useAccount: () => ({ data: { key: { _type: "ED25519", key: "616c696365" } } }),
}));

const ID = "0.0.9001";
const WORLD = world([proposal({ id: ID, operation: TRANSFER })]);
const approvedBy = (memberKey: string): AnimationEvent => ({ kind: "approved", scheduleId: ID, memberKey, at: ago(2) });

type Props = { events: AnimationEvent[]; world: GovernanceSnapshot | null };

/** The hook beside a sign mutation of this session's, as the detail page would run it. */
function renderWithSession(onRemote: (approval: AnimationEvent) => void) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
  return renderHook(
    ({ events, world: read }: Props) => {
      useRemoteApprovals({ events, world: read, network: "testnet", onRemote });
      return {
        sign: useMutation<string, Error, string>({
          mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
          mutationFn: async () => "0.0.1@1.1",
        }),
        failedSign: useMutation<string, Error, string>({
          mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
          mutationFn: async () => {
            throw new Error("rejected in the wallet");
          },
        }),
        signAs: useMutation<string, Error, { scheduleId: string; member: string; memberKey: string }>({
          mutationKey: GOVERNANCE_MUTATION_KEYS.signAs,
          // Never settles: the approval is read while the server is still waiting for its receipt.
          mutationFn: () => new Promise<string>(() => undefined),
        }),
        failedSignAs: useMutation<string, Error, { scheduleId: string; member: string; memberKey: string }>({
          mutationKey: GOVERNANCE_MUTATION_KEYS.signAs,
          mutationFn: async () => {
            throw new Error("refused");
          },
        }),
        open: useMutation({
          mutationKey: GOVERNANCE_MUTATION_KEYS.openNative,
          mutationFn: async (scheduleId: string) => ({ scheduleId }),
        }),
      };
    },
    { wrapper, initialProps: { events: [], world: WORLD } as Props },
  );
}

beforeEach(() => {
  vi.mocked(useHederaSigner).mockReturnValue({ accountId: "0.0.4101" } as ReturnType<typeof useHederaSigner>);
});

describe("useRemoteApprovals", () => {
  it("announces a signature from elsewhere once, however many times the effect runs", () => {
    const onRemote = vi.fn();
    const { rerender } = renderWithSession(onRemote);
    const events = [approvedBy(BOB)];
    rerender({ events, world: WORLD });
    rerender({ events, world: { ...WORLD } });
    expect(onRemote).toHaveBeenCalledTimes(1);
    expect(onRemote).toHaveBeenCalledWith(events[0]);
  });

  it("stays quiet about the signature this session sent, and announces the other one on the same read", async () => {
    const onRemote = vi.fn();
    const { result, rerender } = renderWithSession(onRemote);
    await act(() => result.current.sign.mutateAsync(ID));

    const events = [approvedBy(ALICE), approvedBy(BOB)];
    rerender({ events, world: WORLD });
    expect(onRemote.mock.calls.map(([approval]) => approval.memberKey)).toEqual([BOB]);
  });

  it("announces a signature whose submission here failed: the ledger has it from somewhere else", async () => {
    const onRemote = vi.fn();
    const { result, rerender } = renderWithSession(onRemote);
    await act(() => result.current.failedSign.mutateAsync(ID).catch(() => undefined));

    rerender({ events: [approvedBy(ALICE)], world: WORLD });
    expect(onRemote.mock.calls.map(([approval]) => approval.memberKey)).toEqual([ALICE]);
  });

  it("stays quiet about a demo signature still being sent, and announces the other member's", async () => {
    const onRemote = vi.fn();
    const { result, rerender } = renderWithSession(onRemote);
    act(() => result.current.signAs.mutate({ scheduleId: ID, member: "bob", memberKey: BOB }));
    await waitFor(() => expect(result.current.signAs.isPending).toBe(true));

    rerender({ events: [approvedBy(BOB), approvedBy(CAROL)], world: WORLD });
    expect(onRemote.mock.calls.map(([approval]) => approval.memberKey)).toEqual([CAROL]);
  });

  it("announces a demo signature whose request failed here: the ledger has it from somewhere else", async () => {
    const onRemote = vi.fn();
    const { result, rerender } = renderWithSession(onRemote);
    await act(() =>
      result.current.failedSignAs.mutateAsync({ scheduleId: ID, member: "bob", memberKey: BOB }).catch(() => undefined),
    );
    rerender({ events: [approvedBy(BOB)], world: WORLD });
    expect(onRemote.mock.calls.map(([approval]) => approval.memberKey)).toEqual([BOB]);
  });

  it("does nothing until there is a read", () => {
    const onRemote = vi.fn();
    const { rerender } = renderWithSession(onRemote);
    rerender({ events: [approvedBy(BOB)], world: null });
    expect(onRemote).not.toHaveBeenCalled();
  });

  it("stays quiet about the creator's approval of a proposal this session opened", async () => {
    const onRemote = vi.fn();
    const { result, rerender } = renderWithSession(onRemote);
    await act(() => result.current.open.mutateAsync(ID));

    rerender({ events: [{ kind: "proposed", scheduleId: ID, at: ago(3) }, approvedBy(ALICE)], world: WORLD });
    expect(onRemote).not.toHaveBeenCalled();
  });
});

describe("the session's mutations", () => {
  it("reads the schedule a sign was called with, and nothing from any other shape", () => {
    expect(signedScheduleIdOf(ID)).toBe(ID);
    for (const variables of [undefined, null, 9001, { scheduleId: ID }, [ID]]) {
      expect(signedScheduleIdOf(variables)).toBeUndefined();
    }
  });

  it("reads the schedule and seat a sign-as was called with, and nothing from any other shape", () => {
    expect(signedAsOf({ scheduleId: ID, member: "bob", memberKey: BOB })).toEqual({ scheduleId: ID, memberKey: BOB });
    for (const variables of [
      undefined,
      null,
      ID,
      { scheduleId: ID },
      { memberKey: BOB },
      { scheduleId: 1, memberKey: BOB },
    ]) {
      expect(signedAsOf(variables)).toBeUndefined();
    }
  });

  it("reads the schedule an open returned, and nothing from any other shape", () => {
    expect(openedScheduleIdOf({ scheduleId: ID, transactionId: "0.0.1@1.1" })).toBe(ID);
    for (const data of [undefined, null, ID, 9001, {}, { scheduleId: 9001 }, { scheduleId: null }, { id: ID }]) {
      expect(openedScheduleIdOf(data)).toBeUndefined();
    }
  });
});
