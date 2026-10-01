import { DemoSignButton } from "./DemoSignButton";
import { type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, jsonResponse } from "~~/hooks/mirror/testUtils";
import type { DemoMember } from "~~/services/demoSigners/demoSigners";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
}));

/** Mirror lists the signature the server sent at once. */
const SIGNED = [{ name: "SCHEDULESIGN", result: "SUCCESS" }] as unknown as MirrorTransaction[];

const ALICE: DemoMember = { name: "alice", accountId: "0.0.11", publicKey: "QUxJQ0U=" };
const fetchMock = vi.fn();

function renderButton(onSigned = vi.fn(), client = new QueryClient()) {
  render(<DemoSignButton scheduleId="0.0.9001" member={ALICE} onSigned={onSigned} />, {
    wrapper: createQueryWrapper(client),
  });
  return onSigned;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(fetchTransaction).mockReset().mockResolvedValue(SIGNED);
});
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

  it("posts once, calls onSigned, and stays disabled saying it was sent, without claiming the seat signed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    const onSigned = renderButton();
    const button = screen.getByRole("button", { name: "Sign as Alice" });
    // Both presses land before React has rendered the first one's pending state.
    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ scheduleId: "0.0.9001", member: "alice" });
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button").textContent).toBe("Sent as Alice");
    expect(screen.queryByText(/Signed/)).toBeNull();
  });

  it("says it is signing while the server still has the request", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Sign as Alice" }));
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("Signing as Alice…"));
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
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

  it("stays disabled when the button is mounted again while the signature is still not listed", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ transactionId: "0.0.11@1.1" }));
    const client = new QueryClient();
    const onSigned = renderButton(vi.fn(), client);
    fireEvent.click(screen.getByRole("button", { name: "Sign as Alice" }));
    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1));
    cleanup();

    renderButton(vi.fn(), client);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets the member press again after a refusal", async () => {
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
