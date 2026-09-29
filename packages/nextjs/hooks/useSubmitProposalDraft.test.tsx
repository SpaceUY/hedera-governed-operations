import { useSubmitProposalDraft } from "./useSubmitProposalDraft";
import { TransferTransaction } from "@hiero-ledger/sdk";
import type { RegistryProposal } from "@sh/core/governance/encode";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROPOSAL_KIND_COPY } from "~~/components/governance/wizard/copy";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { useCreateNativeProposal } from "~~/hooks/useCreateNativeProposal";
import { useCreateProposal } from "~~/hooks/useCreateProposal";
import type { ProposalDraft } from "~~/services/governance/drafts";

vi.mock("~~/hooks/useCreateProposal", () => ({ useCreateProposal: vi.fn() }));
vi.mock("~~/hooks/useCreateNativeProposal", () => ({ useCreateNativeProposal: vi.fn() }));

const EXECUTOR = "0.0.4242";

const mockHooks = () => {
  const createRegistry = vi.fn().mockResolvedValue({ registryProposalId: 7, scheduleId: "0.0.901" });
  const createNative = vi.fn().mockResolvedValue({ scheduleId: "0.0.902" });
  vi.mocked(useCreateProposal).mockReturnValue({ mutateAsync: createRegistry, unscheduledEntry: null } as never);
  vi.mocked(useCreateNativeProposal).mockReturnValue({ mutateAsync: createNative } as never);
  return { createRegistry, createNative };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useSubmitProposalDraft", () => {
  it("schedules a native draft with a freshly built transaction, labelled with the kind's title", async () => {
    const { createNative, createRegistry } = mockHooks();
    const built = new TransferTransaction();
    const draft: ProposalDraft = {
      path: "native",
      kind: "treasuryTransfer",
      target: "x",
      buildInnerTransaction: () => built,
    };

    const { result } = renderHook(() => useSubmitProposalDraft(EXECUTOR), { wrapper: createQueryWrapper() });
    result.current.mutate(draft);

    await waitFor(() => expect(result.current.data).toBe("0.0.902"));
    expect(createNative).toHaveBeenCalledWith({
      innerTransaction: built,
      memo: PROPOSAL_KIND_COPY.treasuryTransfer.title,
    });
    expect(createRegistry).not.toHaveBeenCalled();
  });

  it("registers and schedules a registry draft against the executor", async () => {
    const { createNative, createRegistry } = mockHooks();
    const proposal = { target: "0x01", calldata: "0x", registerGas: 1, executeGas: 1, payableTinybars: 0n };
    const draft: ProposalDraft = {
      path: "registry",
      kind: "upgrade",
      target: "x",
      proposal: proposal as unknown as RegistryProposal,
    };

    const { result } = renderHook(() => useSubmitProposalDraft(EXECUTOR), { wrapper: createQueryWrapper() });
    result.current.mutate(draft);

    await waitFor(() => expect(result.current.data).toBe("0.0.901"));
    expect(createRegistry).toHaveBeenCalledWith({
      executorContractId: EXECUTOR,
      proposal,
      memo: PROPOSAL_KIND_COPY.upgrade.title,
    });
    expect(createNative).not.toHaveBeenCalled();
  });

  it("passes on the entry a failed registry submit left unscheduled", () => {
    mockHooks();
    const entry = {
      executorContractId: EXECUTOR,
      target: "0x01",
      calldata: "0x",
      registrationTransactionId: "0.0.1@1.0",
      registryProposalId: 3,
    };
    vi.mocked(useCreateProposal).mockReturnValue({ mutateAsync: vi.fn(), unscheduledEntry: entry } as never);

    const { result } = renderHook(() => useSubmitProposalDraft(EXECUTOR), { wrapper: createQueryWrapper() });

    expect(result.current.unscheduledEntry).toBe(entry);
  });

  it("passes on the request the wallet holds, from whichever path is submitting", () => {
    const request = { action: "schedule", step: 1, steps: 1, validForSeconds: 120 } as const;
    vi.mocked(useCreateProposal).mockReturnValue({
      mutateAsync: vi.fn(),
      unscheduledEntry: null,
      walletRequest: null,
    } as never);
    vi.mocked(useCreateNativeProposal).mockReturnValue({ mutateAsync: vi.fn(), walletRequest: request } as never);

    const { result } = renderHook(() => useSubmitProposalDraft(EXECUTOR), { wrapper: createQueryWrapper() });

    expect(result.current.walletRequest).toBe(request);
  });
});
