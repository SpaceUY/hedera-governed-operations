import { CouncilPreviewPanel } from "./CouncilPreviewPanel";
import type { DraftPreview } from "./drafts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROPOSAL_PATH_CHIPS, approverLabel, expiryLabel, gasLimitLabel } from "~~/services/governance/proposalLabels";
import {
  type RegistryOperation,
  type ScheduledOperation,
  describeRegistryOperation,
  describeScheduledOperation,
} from "~~/services/governance/proposalTypes";
import { PROPOSAL_EXPIRY_SECONDS } from "~~/services/governance/schedules";

afterEach(cleanup);

const COUNCIL = { threshold: 2, memberKeys: ["a", "b", "c"] };

const TRANSFER: ScheduledOperation = {
  kind: "treasuryTransfer",
  hbar: [
    { accountId: "0.0.1", tinybars: -100n },
    { accountId: "0.0.2", tinybars: 100n },
  ],
  tokens: [],
};

const UPGRADE: RegistryOperation = {
  kind: "upgrade",
  target: "0xA",
  implementation: "0xB",
  initializerCalldata: "0x",
  initializer: { kind: "setWithdrawalLimit", limitTinybars: 1_000_000_000n },
};

const NATIVE: DraftPreview = {
  path: "native",
  kind: "treasuryTransfer",
  target: "Recipient · 0.0.2",
  scheduled: TRANSFER,
};

const REGISTRY: DraftPreview = {
  path: "registry",
  kind: "upgrade",
  target: "Vault · 0.0.4260",
  operation: UPGRADE,
  executeGas: 150_000,
  payableTinybars: 0n,
  calldata: "0xdeadbeef",
};

describe("CouncilPreviewPanel", () => {
  it("describes a native proposal the way the detail page will", () => {
    render(<CouncilPreviewPanel preview={NATIVE} council={COUNCIL} />);

    expect(screen.getByRole("heading", { name: "What the council will see" })).toBeTruthy();
    expect(screen.getByText(describeScheduledOperation(TRANSFER))).toBeTruthy();
    for (const chip of PROPOSAL_PATH_CHIPS.treasuryTransfer)
      expect(screen.getAllByText(chip).length).toBeGreaterThan(0);
    expect(screen.getByText("Recipient · 0.0.2")).toBeTruthy();
    expect(screen.getByText(gasLimitLabel(null))).toBeTruthy();
    expect(screen.getByText(expiryLabel(PROPOSAL_EXPIRY_SECONDS))).toBeTruthy();
    expect(screen.getByText(approverLabel("treasuryTransfer", COUNCIL))).toBeTruthy();
  });

  it("shows a registry proposal's gas and calldata", () => {
    render(<CouncilPreviewPanel preview={REGISTRY} council={COUNCIL} />);

    expect(screen.getByText(describeRegistryOperation(UPGRADE))).toBeTruthy();
    expect(screen.getByText(gasLimitLabel(150_000))).toBeTruthy();
    expect(screen.getByText("0xdeadbeef")).toBeTruthy();
  });

  it("warns instead of describing a body the decoder cannot read", () => {
    const unreadable: DraftPreview = {
      path: "native",
      kind: "treasuryTransfer",
      target: "Recipient · 0.0.2",
      scheduled: { kind: "unrecognized", reason: "odd body" },
    };
    render(<CouncilPreviewPanel preview={unreadable} council={undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("odd body");
    expect(screen.queryByText("Function")).toBeNull();
  });
});
