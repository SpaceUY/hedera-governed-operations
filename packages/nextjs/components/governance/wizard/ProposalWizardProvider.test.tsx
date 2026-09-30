import { memo } from "react";
import { ProposalWizardProvider, useProposalWizard } from "./ProposalWizardProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ProposalDraft, draftTreasuryTransfer } from "~~/services/governance/drafts";

const wallet = vi.hoisted(() => ({
  resolve: null as ((scheduleId: string) => void) | null,
  lateSubmission: null as { action: "schedule"; step: number; steps: number; transactionId: string } | null,
}));

// The real mutation machinery, with a submit that waits until the test says the wallet answered.
vi.mock("~~/hooks/useSubmitProposalDraft", async () => {
  const { useMutation: useRealMutation } = await import("@tanstack/react-query");
  return {
    useSubmitProposalDraft: () => ({
      ...useRealMutation<string, Error, ProposalDraft>({
        mutationFn: () =>
          new Promise<string>(resolve => {
            wallet.resolve = resolve;
          }),
      }),
      lateSubmission: wallet.lateSubmission,
    }),
  };
});

const DRAFT = draftTreasuryTransfer("0.0.10671146", { recipientAccountId: "0.0.500", amount: "1" });

afterEach(() => {
  cleanup();
  wallet.resolve = null;
  wallet.lateSubmission = null;
});

/** Stands in for the wizard: fills a draft and submits it through the provider. */
const FakeWizard = () => {
  const { kind, chooseKind, preview, setDraft, submit, lateSubmission } = useProposalWizard();
  return (
    <div>
      <p>kind: {kind}</p>
      <p>{lateSubmission ? `late ${lateSubmission.transactionId}` : "no late submission"}</p>
      <p>{preview ? `previewing ${preview.kind}` : "no preview"}</p>
      <button onClick={() => setDraft({ status: "ready", draft: DRAFT })}>fill</button>
      <button onClick={() => chooseKind("upgrade")}>pick upgrade</button>
      <button onClick={submit}>submit</button>
    </div>
  );
};

const renderHost = (onSubmitted: (scheduleId: string) => void) => {
  const queryClient = new QueryClient();
  const host = (wizard: boolean) => (
    <QueryClientProvider client={queryClient}>
      <ProposalWizardProvider executorContractId="0.0.4242" onSubmitted={onSubmitted}>
        {wizard && <FakeWizard />}
      </ProposalWizardProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(host(true));
  return { closeWizard: () => rerender(host(false)) };
};

describe("ProposalWizardProvider", () => {
  it("dismisses a late submission once another kind is chosen", () => {
    wallet.lateSubmission = { action: "schedule", step: 1, steps: 1, transactionId: "0.0.1@1.0" };
    renderHost(vi.fn());
    expect(screen.getByText("late 0.0.1@1.0")).toBeTruthy();

    fireEvent.click(screen.getByText("pick upgrade"));

    expect(screen.getByText("no late submission")).toBeTruthy();
  });

  it("exposes the draft's preview to whatever sits beside the wizard, and drops it on a new kind", () => {
    renderHost(vi.fn());

    fireEvent.click(screen.getByText("fill"));
    expect(screen.getByText("previewing treasuryTransfer")).toBeTruthy();

    fireEvent.click(screen.getByText("pick upgrade"));
    expect(screen.getByText("kind: upgrade")).toBeTruthy();
    expect(screen.getByText("no preview")).toBeTruthy();
  });

  it("reports a submission that finishes after the wizard was closed", async () => {
    const onSubmitted = vi.fn();
    const { closeWizard } = renderHost(onSubmitted);

    fireEvent.click(screen.getByText("fill"));
    fireEvent.click(screen.getByText("submit"));
    closeWizard();
    expect(screen.queryByText("submit")).toBeNull();

    await waitFor(() => expect(wallet.resolve).not.toBeNull());
    await act(async () => wallet.resolve?.("0.0.901"));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith("0.0.901"));
  });

  it("starts the next proposal from an empty draft and an idle submit once one was handed over", async () => {
    const onSubmitted = vi.fn();
    const StatusProbe = () => {
      const { submitStatus } = useProposalWizard();
      return <p>status: {submitStatus}</p>;
    };
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ProposalWizardProvider executorContractId="0.0.4242" onSubmitted={onSubmitted}>
          <FakeWizard />
          <StatusProbe />
        </ProposalWizardProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText("fill"));
    fireEvent.click(screen.getByText("submit"));
    await waitFor(() => expect(wallet.resolve).not.toBeNull());
    await act(async () => wallet.resolve?.("0.0.902"));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith("0.0.902"));
    await waitFor(() => expect(screen.getByText("status: idle")).toBeTruthy());
    expect(screen.getByText("no preview")).toBeTruthy();
  });

  it("keeps the draft until the hand-over has finished, so the map is not blank while the route is about to move", async () => {
    let finishHandOver: () => void = () => undefined;
    const onSubmitted = vi.fn(() => new Promise<void>(resolve => (finishHandOver = resolve)));
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ProposalWizardProvider executorContractId="0.0.4242" onSubmitted={onSubmitted}>
          <FakeWizard />
        </ProposalWizardProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText("fill"));
    fireEvent.click(screen.getByText("submit"));
    await waitFor(() => expect(wallet.resolve).not.toBeNull());
    await act(async () => wallet.resolve?.("0.0.903"));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith("0.0.903"));
    expect(screen.queryByText("no preview")).toBeNull();

    await act(async () => finishHandOver());
    await waitFor(() => expect(screen.getByText("no preview")).toBeTruthy());
  });

  it("clears the draft and leaves nothing unhandled when the hand-over fails", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const onSubmitted = vi.fn(() => Promise.reject(new Error("read failed")));
    renderHost(onSubmitted);

    fireEvent.click(screen.getByText("fill"));
    fireEvent.click(screen.getByText("submit"));
    await waitFor(() => expect(wallet.resolve).not.toBeNull());
    await act(async () => wallet.resolve?.("0.0.904"));

    await waitFor(() => expect(screen.getByText("no preview")).toBeTruthy());
    await new Promise(resolve => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("does not re-render its consumers when only the host re-renders", () => {
    const renders = vi.fn();
    const MapStandIn = memo(function MapStandIn() {
      useProposalWizard();
      renders();
      return null;
    });
    const onSubmitted = vi.fn();
    const queryClient = new QueryClient();
    const host = (label: string) => (
      <QueryClientProvider client={queryClient}>
        <p>{label}</p>
        <ProposalWizardProvider executorContractId="0.0.4242" onSubmitted={onSubmitted}>
          <MapStandIn />
        </ProposalWizardProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(host("first"));
    rerender(host("second"));

    expect(renders).toHaveBeenCalledTimes(1);
  });
});
