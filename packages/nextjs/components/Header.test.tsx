import { isMenuLinkActive, menuLinks } from "./Header";
import { describe, expect, it } from "vitest";

describe("the header's navigation", () => {
  it("starts with the live map and ends with Settings", () => {
    expect(menuLinks[0]).toMatchObject({ label: "Live map", href: "/" });
    expect(menuLinks.at(-1)).toMatchObject({ label: "Settings", href: "/settings" });
  });

  it("keeps Live map lit on every route of the governance layout except Settings", () => {
    expect(isMenuLinkActive("/", "/")).toBe(true);
    expect(isMenuLinkActive("/", "/governance/new")).toBe(true);
    expect(isMenuLinkActive("/", "/governance/0.0.10590552")).toBe(true);
    expect(isMenuLinkActive("/", "/settings")).toBe(false);
  });

  it("lights Settings only on its own route", () => {
    expect(isMenuLinkActive("/settings", "/settings")).toBe(true);
    expect(isMenuLinkActive("/settings", "/")).toBe(false);
    expect(isMenuLinkActive("/settings", "/governance/new")).toBe(false);
    expect(isMenuLinkActive("/settings", "/settings/council")).toBe(false);
  });
});
