import { type ReactNode, StrictMode } from "react";
import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useHederaSigner } from "./useHederaSigner";
import { useRemoteApprovals } from "./useRemoteApprovals";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationEvent, GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { ALICE, BOB, TRANSFER, ago, proposal, world } from "~~/services/liveMap/motion/motionFixtures";

vi.mock("./useHederaSigner", () => ({ useHederaSigner: vi.fn() }));

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
      useRemoteApprovals({ events, world: read, onRemote });
      return {
        sign: useMutation({
          mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
          mutationFn: async (_id: string) => "0.0.1@1.1",
        }),
        failedSign: useMutation({
          mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
          mutationFn: async (_id: string): Promise<string> => {
            throw new Error("rejected in the wallet");
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
