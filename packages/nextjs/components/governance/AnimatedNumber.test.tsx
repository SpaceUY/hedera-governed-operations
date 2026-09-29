import { AnimatedNumber } from "./AnimatedNumber";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

const withUnit = (value: number | bigint) => `${value} units`;

beforeEach(() => void vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AnimatedNumber", () => {
  it("writes its value as it is, with nothing to count on the first render", () => {
    stubReducedMotion(false);
    render(<AnimatedNumber value={12_345_678_901_234_567_890n} format={withUnit} />);
    expect(screen.getByText("12345678901234567890 units").className).not.toContain("text-success");
  });

  it("counts to a new value in the success colour, then rests on it", () => {
    stubReducedMotion(false);
    const { rerender } = render(<AnimatedNumber value={100} format={withUnit} />);
    rerender(<AnimatedNumber value={200} format={withUnit} />);

    act(() => void vi.advanceTimersByTime(350));
    const counting = screen.getByText(/units/);
    const shown = Number(counting.textContent?.split(" ")[0]);
    expect(shown).toBeGreaterThan(100);
    expect(shown).toBeLessThan(200);
    expect(counting.className).toContain("text-success");

    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByText("200 units").className).not.toContain("text-success");
  });

  it("shows the new value at once under reduced motion", () => {
    stubReducedMotion(true);
    const { rerender } = render(<AnimatedNumber value={100} format={withUnit} />);
    rerender(<AnimatedNumber value={200} format={withUnit} />);
    expect(screen.getByText("200 units").className).not.toContain("text-success");
  });
});
