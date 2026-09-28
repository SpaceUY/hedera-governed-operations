import { ApproverList } from "./ApproverList";
import type { CouncilKey } from "@sh/core/governance/council";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

const COUNCIL: CouncilKey = { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] };
const PROPOSERS = [
  { accountId: "0.0.101", key: "key-a" },
  { accountId: "0.0.102", key: "key-b" },
];

describe("ApproverList", () => {
  it("renders one row per seat, named by the proposer that holds it or the start of its key", () => {
    render(
      <ApproverList
        heading="Approvals"
        council={COUNCIL}
        progress={{ signed: 1, threshold: 2, signedBy: ["key-a"] }}
        proposers={PROPOSERS}
        viewerAccountId={null}
      />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Approvals" })).toBeTruthy();
    expect(screen.getByText("1 of 2 required signatures")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("0.0.101")).toBeTruthy();
    expect(screen.getByText("0.0.102")).toBeTruthy();
    expect(screen.getByText("Member key-c…")).toBeTruthy();
  });

  it("marks the seats that have signed, and only those", () => {
    render(
      <ApproverList
        heading="Approvals"
        council={COUNCIL}
        progress={{ signed: 2, threshold: 2, signedBy: ["key-a", "key-b"] }}
        proposers={PROPOSERS}
        viewerAccountId={null}
      />,
    );
    expect(screen.getAllByText("Signed")).toHaveLength(2);
    expect(screen.getByText("Not yet")).toBeTruthy();
  });

  it("names the connected account's own seat You", () => {
    render(
      <ApproverList
        heading="Approvals"
        council={COUNCIL}
        progress={{ signed: 1, threshold: 2, signedBy: ["key-a"] }}
        proposers={PROPOSERS}
        viewerAccountId="0.0.102"
      />,
    );
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.queryByText("0.0.102")).toBeNull();
  });
});
