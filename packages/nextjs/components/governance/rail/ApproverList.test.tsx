import { ApproverList, type ApproverListProps } from "./ApproverList";
import type { CouncilKey } from "@sh/core/governance/council";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const COUNCIL: CouncilKey = { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] };
const PROPOSERS = [
  { accountId: "0.0.101", key: "key-a" },
  { accountId: "0.0.102", key: "key-b" },
];

const renderList = (props: Partial<ApproverListProps> = {}) =>
  render(
    <ApproverList
      heading="Council"
      council={COUNCIL}
      progress={{ signed: 1, threshold: 2, signedBy: ["key-a"] }}
      proposers={PROPOSERS}
      viewerAccountId={null}
      isCollecting
      {...props}
    />,
  );

describe("ApproverList", () => {
  it("renders one row per seat, named by the proposer that holds it or the start of its key", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 2, name: "Council" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("0.0.101")).toBeTruthy();
    expect(screen.getByText("0.0.102")).toBeTruthy();
    expect(screen.getByText("Member key-c…")).toBeTruthy();
  });

  it("names the seats as the map does, with the map's caption and the account under the name", () => {
    renderList({ memberNames: { "key-b": { name: "Bob", caption: "demo co-signer" } } });
    const bob = screen.getByText("Bob").closest("li")!;
    expect(within(bob).getByText("demo co-signer")).toBeTruthy();
    expect(within(bob).getByText("0.0.102")).toBeTruthy();
  });

  it("marks the seats that have signed, and only those", () => {
    renderList({ progress: { signed: 2, threshold: 2, signedBy: ["key-a", "key-b"] } });
    expect(screen.getAllByText("Signed")).toHaveLength(2);
    expect(screen.getByText("Not yet")).toBeTruthy();
  });

  it("says a seat didn't sign once signatures are no longer collected", () => {
    renderList({ isCollecting: false });
    expect(screen.getAllByText("Didn't sign")).toHaveLength(2);
  });

  it("names the connected account's own seat You, marks it as the viewer's wallet, and puts Sign on it alone", () => {
    renderList({ viewerAccountId: "0.0.102", signAction: <button type="button">Sign with HashPack</button> });
    const row = screen.getByText("your wallet").closest("li")!;
    expect(within(row).getAllByText("You").length).toBeGreaterThan(0);
    expect(within(row).getByText("0.0.102")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Sign with HashPack" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("offers no Sign on the viewer's row once it has signed", () => {
    renderList({ viewerAccountId: "0.0.101", signAction: <button type="button">Sign with HashPack</button> });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("names the seat the co-signing agent holds as the agent, with its account under the name", () => {
    renderList({
      memberNames: { "key-c": { name: "Bob", caption: "demo co-signer" } },
      agent: { accountId: "0.0.103", seat: "key-c" },
    });
    const row = screen.getByText("Co-signing agent").closest("li")!;
    expect(within(row).getByText("AG")).toBeTruthy();
    expect(within(row).getByText("0.0.103")).toBeTruthy();
    expect(within(row).queryByText("demo co-signer")).toBeNull();
    expect(screen.queryByText("Bob")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("puts the rows it is given after the members'", () => {
    renderList({ children: <li>after the members</li> });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows[3].textContent).toBe("after the members");
  });
});
