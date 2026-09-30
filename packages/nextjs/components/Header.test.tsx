import { isMenuLinkActive, menuLinks } from "./Header";
import { describe, expect, it } from "vitest";

describe("the header's navigation", () => {
  it("links the live map and nothing else", () => {
    expect(menuLinks.map(({ label, href }) => [label, href])).toEqual([["Live map", "/"]]);
  });

  it("keeps Live map lit on every route of the governance layout", () => {
    expect(isMenuLinkActive("/", "/")).toBe(true);
    expect(isMenuLinkActive("/", "/governance/new")).toBe(true);
    expect(isMenuLinkActive("/", "/governance/0.0.10590552")).toBe(true);
    expect(isMenuLinkActive("/", "/settings")).toBe(false);
  });

  it("lights any other link only on its own route", () => {
    expect(isMenuLinkActive("/settings", "/settings")).toBe(true);
    expect(isMenuLinkActive("/settings", "/")).toBe(false);
    expect(isMenuLinkActive("/settings", "/settings/council")).toBe(false);
  });
});
