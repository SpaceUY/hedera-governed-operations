import { reconcileReleaseTopic } from "./extensions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EXISTING = "0.0.4242";
const FRESH = "0.0.9999";

const services = (isSigned: boolean) => ({
  lookups: { releaseTopicIsSigned: vi.fn().mockResolvedValue(isSigned) },
  actions: { createReleaseTopic: vi.fn().mockResolvedValue(FRESH) },
});

beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => undefined));

describe("reconcileReleaseTopic", () => {
  it("creates one on the first run", async () => {
    const setup = services(false);

    expect(await reconcileReleaseTopic(undefined, setup)).toBe(FRESH);
    expect(setup.lookups.releaseTopicIsSigned).not.toHaveBeenCalled();
  });

  it("reuses a topic only its submit key can write to", async () => {
    const setup = services(true);

    expect(await reconcileReleaseTopic(EXISTING, setup)).toBe(EXISTING);
    expect(setup.actions.createReleaseTopic).not.toHaveBeenCalled();
  });

  it("replaces a topic anyone can publish to, since its manifests prove nothing", async () => {
    // An earlier version of this script created it without a submit key, and without an admin key
    // there is no adding one: the only repair is a new topic.
    const setup = services(false);

    expect(await reconcileReleaseTopic(EXISTING, setup)).toBe(FRESH);
    expect(setup.actions.createReleaseTopic).toHaveBeenCalledOnce();
  });

  it("says why it replaced the topic, since the id in .env.local changes underneath the operator", async () => {
    await reconcileReleaseTopic(EXISTING, services(false));

    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain("takes messages from anyone");
  });
});
