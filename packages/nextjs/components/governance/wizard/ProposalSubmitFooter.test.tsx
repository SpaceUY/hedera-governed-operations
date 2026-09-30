import { ProposalSubmitFooter } from "./ProposalSubmitFooter";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const wizard = vi.hoisted(() => ({
  submit: vi.fn(),
  submitStatus: "idle" as "idle" | "pending" | "success" | "error",
  submitError: null as Error | null,
  walletRequest: null as unknown,
  lateSubmission: null as unknown,
}));
vi.mock("./ProposalWizardProvider", () => ({ useProposalWizard: () => wizard }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: () => ({ signerKind: "hashpack" }) }));

afterEach(() => {
  cleanup();
  Object.assign(wizard, { submitStatus: "idle", submitError: null, walletRequest: null, lateSubmission: null });
  wizard.submit.mockReset();
});

describe("ProposalSubmitFooter", () => {
  it("submits the layout's draft when the host allows it, and says what one click does", () => {
    render(<ProposalSubmitFooter canSubmit cta="Schedule with your wallet" note="One transaction." />);
    fireEvent.click(screen.getByRole("button", { name: "Schedule with your wallet" }));
    expect(wizard.submit).toHaveBeenCalledOnce();
    expect(screen.getByText("One transaction.")).toBeTruthy();
  });

  it("stays disabled when the host does not allow it", () => {
    render(<ProposalSubmitFooter canSubmit={false} cta="Schedule with your wallet" note="One transaction." />);
    expect((screen.getByRole("button", { name: "Schedule with your wallet" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("shows where to approve in place of the note while the wallet holds a request", () => {
    wizard.walletRequest = { action: "schedule", step: 1, steps: 1, validForSeconds: 120 };
    render(<ProposalSubmitFooter canSubmit={false} cta="Schedule with your wallet" note="One transaction." />);
    expect(screen.getByRole("status").textContent).toContain("Step 1 of 1");
    expect(screen.queryByText("One transaction.")).toBeNull();
  });
});
