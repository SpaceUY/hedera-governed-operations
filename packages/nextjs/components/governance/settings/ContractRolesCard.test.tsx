import { ContractRolesCard } from "./ContractRolesCard";
import { SETTINGS_COPY } from "./copy";
import { longZeroAddress } from "@sh/core/identity";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";

const TREASURY_ID = "0.0.10671103";
const EXECUTOR = { address: "0x5aF0000000000000000000000000000000000Abc", hederaContractId: "0.0.10671156" };
const CONFIG = { governanceAccountId: TREASURY_ID, executor: EXECUTOR } as unknown as GovernanceConfig;
const ROLES = {
  executors: [longZeroAddress(TREASURY_ID)],
  proposerAdmins: [EXECUTOR.address],
  executorAdmins: [EXECUTOR.address],
};
const COUNCIL = {
  key: { threshold: 2, memberKeys: ["key-a", "key-b"] },
  proposerAccountIds: ["0.0.101", "0.0.102"],
  proposers: [
    { accountId: "0.0.101", key: "key-a" },
    { accountId: "0.0.102", key: null },
  ],
  unresolvableProposers: [],
} as unknown as CouncilQueryData;
const NAMING = { proposers: COUNCIL.proposers, viewerAccountId: null };

type Overrides = Partial<Parameters<typeof ContractRolesCard>[0]>;
const renderCard = (overrides: Overrides = {}) =>
  render(
    <ContractRolesCard
      roles={ROLES}
      rolesUnreadable={false}
      council={COUNCIL}
      config={CONFIG}
      naming={NAMING}
      {...overrides}
    />,
  );

afterEach(cleanup);

describe("ContractRolesCard", () => {
  it("describes the roles as the deployment set them up, and offers nothing to change", () => {
    renderCard();
    const card = screen.getByRole("region", { name: SETTINGS_COPY.roles.heading });
    expect(screen.getByRole("heading", { level: 2, name: SETTINGS_COPY.roles.heading })).toBeTruthy();
    for (const term of [SETTINGS_COPY.roles.proposer, SETTINGS_COPY.roles.executor, SETTINGS_COPY.roles.admin])
      expect(within(card).getByText(term)).toBeTruthy();
    expect(within(card).getByText(SETTINGS_COPY.roles.onlyTreasury(TREASURY_ID))).toBeTruthy();
    expect(within(card).getByText(SETTINGS_COPY.roles.registryItself)).toBeTruthy();
    expect(within(card).getByText(SETTINGS_COPY.roles.note)).toBeTruthy();
    expect(within(card).getByText("0.0.101, 0.0.102")).toBeTruthy();
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("lists the addresses read when they are not what the deployment set up", () => {
    const other = "0x00000000000000000000000000000000DeaDBeef";
    renderCard({
      roles: { executors: [longZeroAddress(TREASURY_ID), other], proposerAdmins: [other], executorAdmins: [] },
    });
    expect(screen.queryByText(SETTINGS_COPY.roles.onlyTreasury(TREASURY_ID))).toBeNull();
    expect(screen.queryByText(SETTINGS_COPY.roles.registryItself)).toBeNull();
    expect(screen.getByText(SETTINGS_COPY.roles.holders([longZeroAddress(TREASURY_ID), other]))).toBeTruthy();
    expect(screen.getByText(SETTINGS_COPY.roles.holders([other]))).toBeTruthy();
  });

  it("keeps the council's proposers when the relay could not be read, and says so for the other two", () => {
    renderCard({ roles: undefined, rolesUnreadable: true });
    expect(screen.getByText("0.0.101, 0.0.102")).toBeTruthy();
    expect(screen.getAllByText(SETTINGS_COPY.roles.unreadable)).toHaveLength(2);
  });

  it("waits quietly while the roles and the council are read", () => {
    renderCard({ roles: undefined, council: undefined });
    expect(screen.getAllByText(SETTINGS_COPY.roles.loading)).toHaveLength(3);
  });

  it("names a proposer address no account answers for", () => {
    const council = { ...COUNCIL, unresolvableProposers: ["0xdead"] } as CouncilQueryData;
    renderCard({ council });
    expect(screen.getByText(SETTINGS_COPY.roles.unresolvable(["0xdead"]))).toBeTruthy();
  });
});
