import { OperationTypePicker } from "./OperationTypePicker";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROPOSAL_FAMILY_HEADINGS, PROPOSAL_KIND_COPY } from "~~/components/governance/wizard/copy";

afterEach(cleanup);

const radio = (title: string) => screen.getByRole("radio", { name: new RegExp(title) }) as HTMLInputElement;

describe("OperationTypePicker", () => {
  it("groups the kinds under their path and checks the selected one", () => {
    render(<OperationTypePicker value="upgrade" onChange={vi.fn()} council={undefined} />);

    expect(screen.getByRole("group", { name: PROPOSAL_FAMILY_HEADINGS.contract })).toBeTruthy();
    expect(screen.getByRole("group", { name: PROPOSAL_FAMILY_HEADINGS.native })).toBeTruthy();
    expect(radio(PROPOSAL_KIND_COPY.upgrade.title).checked).toBe(true);
    expect(radio(PROPOSAL_KIND_COPY.treasuryTransfer.title).checked).toBe(false);
  });

  it("makes both groups one choice, so only one kind can be selected", () => {
    render(<OperationTypePicker value="upgrade" onChange={vi.fn()} council={undefined} />);

    expect(radio(PROPOSAL_KIND_COPY.upgrade.title).name).toBe(radio(PROPOSAL_KIND_COPY.treasuryTransfer.title).name);
  });

  it("reads a kind's hint off the current council once it is known", () => {
    const { rerender } = render(<OperationTypePicker value="upgrade" onChange={vi.fn()} council={undefined} />);
    expect(screen.getByText(PROPOSAL_KIND_COPY.councilRotation.hint)).toBeTruthy();

    rerender(
      <OperationTypePicker
        value="upgrade"
        onChange={vi.fn()}
        council={{ threshold: 2, memberKeys: ["a", "b", "c"] }}
      />,
    );
    expect(screen.getByText("→ 2-of-4 council")).toBeTruthy();
    expect(screen.getByText(PROPOSAL_KIND_COPY.treasuryTransfer.hint)).toBeTruthy();
  });

  it("reports the kind picked", () => {
    const onChange = vi.fn();
    render(<OperationTypePicker value="upgrade" onChange={onChange} council={undefined} />);
    fireEvent.click(radio(PROPOSAL_KIND_COPY.treasuryTransfer.title));
    expect(onChange).toHaveBeenCalledWith("treasuryTransfer");
  });
});
