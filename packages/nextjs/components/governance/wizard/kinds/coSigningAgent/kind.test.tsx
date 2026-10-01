import { CO_SIGNING_AGENT_KIND } from "./kind";
import { cleanup, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GovernanceConfig, getCoSigningAgentAccountId } from "~~/config/governanceConfig";
import { useAccount } from "~~/hooks/mirror/useAccount";

vi.mock("~~/config/governanceConfig", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/config/governanceConfig")>()),
  getCoSigningAgentAccountId: vi.fn(),
}));
vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/components/governance/graph/useComposedMap", () => ({
  useLatestComposedMap: () => ({ composed: undefined }),
}));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HederaAddressInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Agent account" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;
const CONFIG = { governanceAccountId: "0.0.10746004" } as GovernanceConfig;

function openForm() {
  const opened = CO_SIGNING_AGENT_KIND.open({ config: CONFIG, chain: CHAIN });
  if (opened.status !== "available") throw new Error("The agent kind should always open");
  render(<>{opened.renderForm({ network: "testnet", chain: CHAIN, council: undefined, onDraftChange: vi.fn() })}</>);
  return screen.getByLabelText<HTMLInputElement>("Agent account");
}

beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue({ data: undefined, error: null, isLoading: false } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the add-the-agent kind", () => {
  it("starts the agent account from the configured co-signing agent", () => {
    vi.mocked(getCoSigningAgentAccountId).mockReturnValue("0.0.600");
    expect(openForm().value).toBe("0.0.600");
  });

  it("starts empty when no agent is configured", () => {
    vi.mocked(getCoSigningAgentAccountId).mockReturnValue(null);
    expect(openForm().value).toBe("");
  });
});
