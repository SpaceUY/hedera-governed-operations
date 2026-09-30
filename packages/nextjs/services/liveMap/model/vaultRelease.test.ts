import { releaseOf } from "./vaultRelease";
import { describe, expect, it } from "vitest";

const FIRST = "0x83187fe769f2730EA3c0A9886830a74C8110F73D";
const NEXT = "0xb87228Be9d802953d9e657f97b827786b22e7305";
const RELEASES = { first: FIRST, next: NEXT };

describe("releaseOf", () => {
  it("names which release an address is, in any casing, and null for any other code", () => {
    expect(releaseOf(FIRST.toLowerCase(), RELEASES)).toBe("first");
    expect(releaseOf(NEXT, RELEASES)).toBe("next");
    expect(releaseOf("0x0000000000000000000000000000000000000001", RELEASES)).toBeNull();
    expect(releaseOf(NEXT, {})).toBeNull();
  });
});
