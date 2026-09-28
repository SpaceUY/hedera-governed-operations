import { UpgradeVaultForm } from "./UpgradeVaultForm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type Chain, parseAbi } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DraftResult, previewDraft } from "~~/services/governance/drafts";

vi.mock("@scaffold-hbar-ui/components", () => ({
  HbarInput: ({
    chain,
    onValueChange,
  }: {
    chain?: Chain;
    onValueChange: (value: { valueInNative: string; valueInUsd: string; displayUsdMode: boolean }) => void;
  }) => (
    <input
      aria-label="Withdrawal limit"
      data-chain-id={chain?.id}
      onChange={event => onValueChange({ valueInNative: event.target.value, valueInUsd: "", displayUsdMode: false })}
    />
  ),
}));

const TARGETS = {
  proxy: "0x00000000000000000000000000000000000A11cE",
  proxyContractId: "0.0.4260",
  implementation: "0x00000000000000000000000000000000000B0b00",
  implementationAbi: parseAbi(["function initV2(uint256 limit)"]),
} as const;
const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = () => {
  const onDraftChange = vi.fn<(result: DraftResult) => void>();
  render(<UpgradeVaultForm targets={TARGETS} chain={CHAIN} onDraftChange={onDraftChange} />);
  return onDraftChange;
};

const typeLimit = (limit: string) =>
  fireEvent.change(screen.getByLabelText("Withdrawal limit"), { target: { value: limit } });

describe("UpgradeVaultForm", () => {
  it("shows the implementation it upgrades to, which the proposer cannot change", () => {
    renderForm();

    const implementation = screen.getByDisplayValue(TARGETS.implementation) as HTMLInputElement;
    expect(implementation.readOnly).toBe(true);
    expect(screen.getByLabelText("Withdrawal limit").getAttribute("data-chain-id")).toBe("296");
  });

  it("has no draft until a withdrawal limit is set", () => {
    const onDraftChange = renderForm();

    expect(onDraftChange).toHaveBeenLastCalledWith({ status: "empty" });
  });

  it("drafts an upgrade that runs initV2 with the limit in the approved call", () => {
    const onDraftChange = renderForm();

    typeLimit("25");

    const result = onDraftChange.mock.lastCall?.[0];
    if (result?.status !== "ready") throw new Error("expected a ready draft");
    expect(result.draft).toMatchObject({ path: "registry", kind: "upgrade", target: "Vault · 0.0.4260" });
    const preview = previewDraft(result.draft);
    if (preview.path !== "registry" || preview.operation.kind !== "upgrade") throw new Error("expected an upgrade");
    expect(preview.operation.initializer).toEqual({ kind: "setWithdrawalLimit", limitTinybars: 2_500_000_000n });
  });

  it("refuses a limit of zero, which would refuse every withdrawal", () => {
    const onDraftChange = renderForm();

    typeLimit("0");

    expect(onDraftChange).toHaveBeenLastCalledWith({
      status: "invalid",
      message: "A withdrawal limit of zero would refuse every withdrawal",
    });
  });
});
