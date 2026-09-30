import { RemoteSignatureBanner, useRemoteSignatureNotice } from "./RemoteSignatureBanner";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let show: (text: string) => void = () => undefined;

function Host() {
  const notice = useRemoteSignatureNotice();
  show = notice.show;
  return <RemoteSignatureBanner notice={notice.notice} onDismiss={notice.dismiss} />;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RemoteSignatureBanner", () => {
  it("keeps an empty polite status until a signature from elsewhere is read, then says it", () => {
    render(<Host />);
    expect(screen.getByRole("status").textContent).toBe("");
    // In the accessibility tree before anything is said: a hidden live region may not be announced.
    expect(screen.getByRole("status").className).not.toMatch(/hidden/);
    act(() => show("Bob signed “Upgrade” from their own device."));
    expect(screen.getByRole("status").textContent).toContain("Bob signed");
  });

  it("clears itself after a while, and a newer notice starts its own clock", () => {
    render(<Host />);
    act(() => show("Alice signed."));
    act(() => vi.advanceTimersByTime(6_000));
    act(() => show("Bob signed."));
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole("status").textContent).toContain("Bob signed.");
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("can be dismissed", () => {
    render(<Host />);
    act(() => show("Bob signed."));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
