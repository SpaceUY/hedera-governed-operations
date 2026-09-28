import { isMenuLinkActive, menuLinks } from "./Header";
import { describe, expect, it } from "vitest";

describe("the header's navigation", () => {
  it("names the two demos and nothing else", () => {
    expect(menuLinks.map(({ label, href }) => [label, href])).toEqual([
      ["Live map", "/"],
      ["Proof wall", "/proof-wall"],
    ]);
  });

  it("keeps Live map lit on every route of the governance layout", () => {
    expect(isMenuLinkActive("/", "/")).toBe(true);
    expect(isMenuLinkActive("/", "/governance/new")).toBe(true);
    expect(isMenuLinkActive("/", "/governance/0.0.10590552")).toBe(true);
    expect(isMenuLinkActive("/", "/proof-wall")).toBe(false);
    expect(isMenuLinkActive("/", "/explorer")).toBe(false);
  });

  it("lights any other link only on its own route", () => {
    expect(isMenuLinkActive("/proof-wall", "/proof-wall")).toBe(true);
    expect(isMenuLinkActive("/proof-wall", "/")).toBe(false);
    expect(isMenuLinkActive("/proof-wall", "/my-proofs")).toBe(false);
  });
});
