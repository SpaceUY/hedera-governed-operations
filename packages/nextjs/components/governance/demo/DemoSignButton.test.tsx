import { DemoSignButton } from "./DemoSignButton";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, jsonResponse } from "~~/hooks/mirror/testUtils";
import type { DemoMember } from "~~/services/demoSigners/demoSigners";

const ALICE: DemoMember = { name: "alice", accountId: "0.0.11", publicKey: "QUxJQ0U=" };
const fetchMock = vi.fn();

function renderButton(onSigned = vi.fn()) {
  render(<DemoSignButton scheduleId="0.0.9001" member={ALICE} onSigned={onSigned} />, {
    wrapper: createQueryWrapper(),
  });
  return onSigned;
}

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("DemoSignButton", () => {
  it("names the member it signs as, styled like the wallet's Sign", () => {
    renderButton();
    const button = screen.getByRole("button", { name: "Sign as Alice" });
    expect(button.className).toContain("btn-primary");
    expect(button.className).toContain("btn-sm");
  });

  it("posts once, calls onSigned, and stays disabled without claiming the seat signed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    const onSigned = renderButton();
    const button = screen.getByRole("button", { name: "Sign as Alice" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ scheduleId: "0.0.9001", member: "alice" });
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button").textContent).toBe("Signing as Alice…");
    expect(screen.queryByText(/Signed/)).toBeNull();
  });

  it("shows the server's refusal and lets the member try again", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "This proposal is not waiting for a signature from 0.0.11." }, 409),
    );
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Sign as Alice" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not waiting for a signature from 0.0.11");
    expect((screen.getByRole("button", { name: "Sign as Alice" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("lets the member press again after a refusal, and only then", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ error: "The registry could not be read. Try again." }, 502),
    );
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Sign as Alice" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Sign as Alice" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("never sends the member's key, only the schedule and the member", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Sign as Alice" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][1].body).not.toContain(ALICE.publicKey);
  });
});
