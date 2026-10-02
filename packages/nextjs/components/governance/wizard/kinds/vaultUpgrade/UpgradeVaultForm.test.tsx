import { UpgradeVaultForm } from "./UpgradeVaultForm";
import { VAULT_UPGRADE_COPY } from "./copy";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type Chain, parseAbi } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVaultImplementation } from "~~/hooks/mirror/useVaultImplementation";
import type { DraftResult } from "~~/services/governance/drafts";

vi.mock("~~/hooks/mirror/useVaultImplementation", () => ({ useVaultImplementation: vi.fn() }));
vi.mock("./ReleaseLine", () => ({ ReleaseLine: () => null }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HbarInput: ({ onValueChange }: { onValueChange: (value: { valueInNative: string }) => void }) => (
    <input aria-label="Withdrawal limit" onChange={event => onValueChange({ valueInNative: event.target.value })} />
  ),
}));

const V1 = "0x00000000000000000000000000000000000c0de1";
const V2 = "0x00000000000000000000000000000000000B0b00";
const TARGETS = {
  proxy: "0x00000000000000000000000000000000000A11cE",
  proxyContractId: "0.0.4260",
  implementation: V2,
  implementationAbi: parseAbi(["function initV2(uint256 limit)"]),
} as const;
const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;

const runs = (read: { data?: string | null; isLoading?: boolean }) =>
  vi.mocked(useVaultImplementation).mockReturnValue({ data: undefined, isLoading: false, ...read } as never);

const renderForm = () => {
  const onDraftChange = vi.fn<(result: DraftResult) => void>();
  render(
    <UpgradeVaultForm
      targets={TARGETS}
      network="testnet"
      chain={CHAIN}
      council={undefined}
      onDraftChange={onDraftChange}
    />,
  );
  fireEvent.change(screen.getByLabelText("Withdrawal limit"), { target: { value: "10" } });
  return onDraftChange.mock.lastCall?.[0];
};

beforeEach(() => runs({ data: V1 }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UpgradeVaultForm", () => {
  it("drafts the upgrade of a vault that still runs v1", () => {
    expect(renderForm()?.status).toBe("ready");
  });

  it("refuses the upgrade once the vault runs v2, whatever the casing of the slot", () => {
    runs({ data: V2.toLowerCase() });
    expect(renderForm()).toEqual({ status: "invalid", message: VAULT_UPGRADE_COPY.alreadyRunning });
  });

  it("waits while the vault is read, and holds nothing back when it could not be", () => {
    runs({ isLoading: true });
    expect(renderForm()).toEqual({ status: "empty" });
    cleanup();

    runs({ data: undefined });
    expect(renderForm()?.status).toBe("ready");
  });
});
