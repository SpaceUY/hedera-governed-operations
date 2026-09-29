import SettingsPage from "./page";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SETTINGS_COPY } from "~~/components/governance/settings/copy";

afterEach(cleanup);

describe("SettingsPage", () => {
  it("titles the rail Settings and leads back to the map", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: SETTINGS_COPY.heading })).toBeTruthy();
    expect(screen.getByRole("link", { name: SETTINGS_COPY.backLabel }).getAttribute("href")).toBe("/");
  });
});
