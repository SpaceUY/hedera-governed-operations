import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// `server-only` throws outside a React Server Components build; the tests import server modules directly.
vi.mock("server-only", () => ({}));

// Testing Library only auto-cleans with global test hooks; Vitest exposes none by default.
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; the WalletConnect modal reads it at import time.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}
