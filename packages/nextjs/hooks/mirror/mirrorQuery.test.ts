import { resolvePendingRefetchInterval } from "./mirrorQuery";
import { describe, expect, it } from "vitest";
import { MirrorNodeError } from "~~/services/mirror";

const INTERVAL = 5_000;
const notFound = new MirrorNodeError(404, "https://mirror/x", "Not found");
const serverError = new MirrorNodeError(500, "https://mirror/x", "boom");

describe("resolvePendingRefetchInterval", () => {
  it("keeps polling while the entity is not settled", () => {
    expect(resolvePendingRefetchInterval({ isSettled: false, error: null }, INTERVAL)).toBe(INTERVAL);
  });

  it("stops polling once the entity is settled", () => {
    expect(resolvePendingRefetchInterval({ isSettled: true, error: null }, INTERVAL)).toBe(false);
  });

  it("keeps polling on 404 because Mirror may not have indexed the entity yet", () => {
    expect(resolvePendingRefetchInterval({ isSettled: undefined, error: notFound }, INTERVAL)).toBe(INTERVAL);
  });

  it("stops polling on other Mirror errors", () => {
    expect(resolvePendingRefetchInterval({ isSettled: undefined, error: serverError }, INTERVAL)).toBe(false);
  });

  it("does not poll before the first result arrives", () => {
    expect(resolvePendingRefetchInterval({ isSettled: undefined, error: null }, INTERVAL)).toBe(false);
  });
});
