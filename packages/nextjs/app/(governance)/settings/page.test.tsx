import SettingsPage from "./page";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_COPY } from "~~/components/governance/settings/copy";

vi.mock("~~/components/governance/GovernanceProvider", () => ({
  useGovernanceConfig: () => ({
    network: "testnet",
    governanceAccountId: "0.0.500",
    executor: { hederaContractId: "0.0.600" },
  }),
}));
vi.mock("~~/hooks/mirror/useCouncil", () => ({
  useCouncil: () => ({
    data: {
      key: { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] },
      proposerAccountIds: [],
      proposers: [],
      unresolvableProposers: [],
    },
    isError: false,
  }),
}));
vi.mock("~~/components/governance/graph/useComposedMap", () => ({ useLatestComposedMap: () => ({ composed: null }) }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: () => null }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: () => ({ accountId: null }) }));

afterEach(cleanup);

describe("SettingsPage", () => {
  it("titles the rail Settings and leads back to the map", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: SETTINGS_COPY.heading })).toBeTruthy();
    expect(screen.getByRole("link", { name: SETTINGS_COPY.backLabel }).getAttribute("href")).toBe("/");
  });

  it("shows the council read from the treasury account's key", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 2, name: SETTINGS_COPY.council.heading })).toBeTruthy();
    expect(screen.getByText("2-of-3")).toBeTruthy();
  });
});
