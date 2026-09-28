import { reconcileSignedTopic } from "./extensions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EXISTING = "0.0.4242";
const FRESH = "0.0.9999";
const SUBJECT = "Release topic";

const services = (isSigned: boolean) => ({
  isSigned: vi.fn().mockResolvedValue(isSigned),
  create: vi.fn().mockResolvedValue(FRESH),
});

beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => undefined));

describe("reconcileSignedTopic", () => {
  it("creates one on the first run", async () => {
    const setup = services(false);

    expect(await reconcileSignedTopic(undefined, SUBJECT, setup)).toBe(FRESH);
    expect(setup.isSigned).not.toHaveBeenCalled();
  });

  it("reuses a topic only its submit key can write to", async () => {
    const setup = services(true);

    expect(await reconcileSignedTopic(EXISTING, SUBJECT, setup)).toBe(EXISTING);
    expect(setup.create).not.toHaveBeenCalled();
  });

  it("replaces a topic anyone can publish to, since what is on it proves nothing", async () => {
    // An earlier version of this script created it without a submit key, and without an admin key
    // there is no adding one: the only repair is a new topic.
    const setup = services(false);

    expect(await reconcileSignedTopic(EXISTING, SUBJECT, setup)).toBe(FRESH);
    expect(setup.create).toHaveBeenCalledOnce();
  });

  it("says why it replaced the topic, since the id in .env.local changes underneath the operator", async () => {
    await reconcileSignedTopic(EXISTING, SUBJECT, services(false));

    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain("takes messages from anyone");
  });

  it("names the topic it is reporting on, since the run creates two of them", async () => {
    await reconcileSignedTopic(undefined, "Agent decision topic", services(false));

    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain(`Agent decision topic ${FRESH}`);
  });
});
