import { OperationTypePicker } from "./OperationTypePicker";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROPOSAL_FAMILY_HEADINGS, PROPOSAL_KIND_COPY } from "~~/services/governance/proposalLabels";

afterEach(cleanup);

describe("OperationTypePicker", () => {
  it("groups the kinds under their path and marks the selected one", () => {
    render(<OperationTypePicker value="upgrade" onChange={vi.fn()} />);

    expect(screen.getByText(PROPOSAL_FAMILY_HEADINGS.contract)).toBeTruthy();
    expect(screen.getByText(PROPOSAL_FAMILY_HEADINGS.native)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: new RegExp(PROPOSAL_KIND_COPY.upgrade.title) }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("reports the kind picked", () => {
    const onChange = vi.fn();
    render(<OperationTypePicker value="upgrade" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PROPOSAL_KIND_COPY.treasuryTransfer.title) }));
    expect(onChange).toHaveBeenCalledWith("treasuryTransfer");
  });
});
