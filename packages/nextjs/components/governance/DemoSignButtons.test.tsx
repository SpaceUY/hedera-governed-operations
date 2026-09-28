import { DemoSignButtons } from "./DemoSignButtons";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, jsonResponse } from "~~/hooks/mirror/testUtils";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import type { DemoMember } from "~~/services/demoSigners/demoSigners";
import type { Proposal } from "~~/services/governance/proposals";
import type { MirrorSchedule } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));

const OWNER = "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W";
const ALICE = "A8ZOXqRHjGJ59xH6h3Zh96PaVXzEHtJA/DtxSFHTmFO7";
const BOB = "Ax8MbYmp8RO1AM0RSYCMOv2/QHQ60UBTWwtbrbcwzPfs";
const SCHEDULE_ID = "0.0.10590552";

const members: DemoMember[] = [
  { name: "alice", accountId: "0.0.11", publicKey: ALICE },
  { name: "bob", accountId: "0.0.12", publicKey: BOB },
];

const proposalSignedBy = (signedBy: string[]): Proposal => ({
  schedule: { ...executedSchedule, schedule_id: SCHEDULE_ID } as MirrorSchedule,
  state: { status: "pending", signatureCount: signedBy.length, executedAt: null, expiresAt: null, isSettled: false },
  progress: { signed: signedBy.length, threshold: 2, signedBy },
  incomingProgress: null,
  execution: { status: "notRun" },
  operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
  registry: { status: "notApplicable" },
});

const fetchMock = vi.fn();

function renderButtons(proposal: Proposal, onSigned = vi.fn()) {
  render(
    <DemoSignButtons
      proposal={proposal}
      governanceAccountId="0.0.10590498"
      executorContractId="0.0.10671156"
      onSigned={onSigned}
    />,
    { wrapper: createQueryWrapper() },
  );
  return onSigned;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(useCouncil).mockReturnValue({
    data: { key: { threshold: 2, memberKeys: [OWNER, ALICE, BOB] }, proposerAccountIds: [], unresolvableProposers: [] },
  } as never);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("DemoSignButtons", () => {
  it("offers a button for each demo member who has not signed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ members }));
    renderButtons(proposalSignedBy([ALICE]));

    expect(await screen.findByRole("button", { name: "Sign as Bob" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign as Alice" })).toBeNull();
  });

  it("renders nothing when the server has no demo keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ members: [] }));
    renderButtons(proposalSignedBy([]));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing while the council has not been read", async () => {
    vi.mocked(useCouncil).mockReturnValue({ data: undefined } as never);
    fetchMock.mockResolvedValue(jsonResponse({ members }));
    renderButtons(proposalSignedBy([]));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks the server to sign, then refreshes and waits for Mirror instead of showing it signed", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST" ? jsonResponse({ transactionId: "0.0.11@1.0" }) : jsonResponse({ members }),
      ),
    );
    const onSigned = renderButtons(proposalSignedBy([]));

    fireEvent.click(await screen.findByRole("button", { name: "Sign as Alice" }));

    const waiting = await screen.findByRole<HTMLButtonElement>("button", { name: /Submitted as Alice/ });
    expect(waiting.disabled).toBe(true);
    expect(onSigned).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(JSON.parse(init.body)).toEqual({ scheduleId: SCHEDULE_ID, member: "alice" });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Sign as Bob" }).disabled).toBe(false);
  });

  it("shows the server's refusal", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "POST"
          ? jsonResponse({ error: "Demo signers only run on testnet." }, 403)
          : jsonResponse({ members }),
      ),
    );
    renderButtons(proposalSignedBy([]));

    fireEvent.click(await screen.findByRole("button", { name: "Sign as Alice" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Demo signers only run on testnet.");
  });
});
