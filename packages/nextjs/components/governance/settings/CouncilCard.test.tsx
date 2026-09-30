import { CouncilCard } from "./CouncilCard";
import { SETTINGS_COPY } from "./copy";
import type { PublicKey } from "@hiero-ledger/sdk";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AGENT_COPY } from "~~/components/governance/rail/copy";
import { CO_SIGNING_AGENT_COPY } from "~~/components/governance/wizard/kinds/coSigningAgent/copy";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";

afterEach(cleanup);

const COUNCIL: CouncilQueryData = {
  key: { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] },
  proposerAccountIds: ["0.0.101", "0.0.102", "0.0.103"],
  proposers: [
    { accountId: "0.0.101", key: "key-a" },
    { accountId: "0.0.102", key: "key-b" },
    { accountId: "0.0.103", key: "key-c" },
  ],
  unresolvableProposers: [],
};
const NAMES = {
  "key-a": { name: "You" },
  "key-b": { name: "Alice", caption: "demo co-signer" },
  "key-c": { name: "Bob", caption: "demo co-signer" },
};
const naming = (agent: { accountId: string; seat: string | null } | null = null) => ({
  proposers: COUNCIL.proposers,
  viewerAccountId: "0.0.101",
  memberNames: NAMES,
  agent,
});

describe("CouncilCard", () => {
  it("states the live rule and lists every seat as the map names it, without signature states", () => {
    render(<CouncilCard council={COUNCIL} unreadable={false} naming={naming()} unseatedAgent={null} />);
    expect(screen.getByRole("heading", { level: 2, name: SETTINGS_COPY.council.heading })).toBeTruthy();
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(screen.getByText(SETTINGS_COPY.council.ruleSuffix)).toBeTruthy();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Alice")).toBeTruthy();
    expect(within(rows[1]).getByText("demo co-signer")).toBeTruthy();
    expect(within(rows[1]).getByText("0.0.102")).toBeTruthy();
    expect(screen.queryByText("Not yet")).toBeNull();
    expect(screen.queryByText("Signed")).toBeNull();
  });

  it("marks the viewer's own seat", () => {
    render(<CouncilCard council={COUNCIL} unreadable={false} naming={naming()} unseatedAgent={null} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getAllByText("You").length).toBeGreaterThan(0);
    expect(within(rows[0]).getByText(/your wallet/i)).toBeTruthy();
  });

  it("names the co-signing agent as a member when the council holds its key", () => {
    render(
      <CouncilCard
        council={COUNCIL}
        unreadable={false}
        naming={naming({ accountId: "0.0.103", seat: "key-c" })}
        unseatedAgent={null}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(AGENT_COPY.name)).toBeTruthy();
    expect(screen.queryByText(AGENT_COPY.notMember)).toBeNull();
  });

  it("adds a dashed row for an agent the council does not seat, naming the council ticking it would propose", () => {
    render(
      <CouncilCard
        council={COUNCIL}
        unreadable={false}
        naming={naming({ accountId: "0.0.600", seat: "key-d" })}
        unseatedAgent={{ seat: "key-d", check: { status: "found", key: {} as PublicKey } }}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(AGENT_COPY.notMember)).toBeTruthy();
    expect(screen.getByText(SETTINGS_COPY.council.agentNotSeated("2-of-4"))).toBeTruthy();
  });

  it("says why an agent holding an ED25519 key cannot be seated, instead of pointing at a tile that is not there", () => {
    const reason = CO_SIGNING_AGENT_COPY.notEcdsa("0.0.600", "ED25519");
    render(
      <CouncilCard
        council={COUNCIL}
        unreadable={false}
        naming={naming({ accountId: "0.0.600", seat: "key-d" })}
        unseatedAgent={{ seat: "key-d", check: { status: "invalid", message: reason } }}
      />,
    );
    expect(screen.getByText(AGENT_COPY.notMember)).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.queryByText(SETTINGS_COPY.council.agentNotSeated("2-of-4"))).toBeNull();
  });

  it("shows no agent row while no agent is configured or read", () => {
    render(<CouncilCard council={COUNCIL} unreadable={false} naming={naming(null)} unseatedAgent={null} />);
    expect(screen.queryByText(AGENT_COPY.name)).toBeNull();
  });

  it("says so when the council could not be read, and waits quietly while it is read", () => {
    const { rerender } = render(
      <CouncilCard council={undefined} unreadable={false} naming={naming()} unseatedAgent={null} />,
    );
    expect(screen.getByRole("status", { name: SETTINGS_COPY.council.loading })).toBeTruthy();
    rerender(<CouncilCard council={undefined} unreadable naming={naming()} unseatedAgent={null} />);
    expect(screen.getByText(SETTINGS_COPY.council.unreadable)).toBeTruthy();
  });

  it("keeps the council it has when a later read fails, so it agrees with the composer below", () => {
    render(<CouncilCard council={COUNCIL} unreadable naming={naming()} unseatedAgent={null} />);
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(SETTINGS_COPY.council.unreadable)).toBeNull();
  });
});
