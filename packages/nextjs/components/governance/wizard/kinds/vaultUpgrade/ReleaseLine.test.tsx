import { ReleaseLine } from "./ReleaseLine";
import { ReleaseReadError } from "@sh/core/governance/releaseManifest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReleaseCheck } from "~~/hooks/mirror/useReleaseCheck";

vi.mock("~~/hooks/mirror/useReleaseCheck", () => ({ useReleaseCheck: vi.fn() }));

const IMPLEMENTATION = "0x00000000000000000000000000000000000B0b00";
const TOPIC = "0.0.4242";

const mockQuery = (query: { data?: unknown; error?: Error }) =>
  vi.mocked(useReleaseCheck).mockReturnValue({
    data: undefined,
    error: null,
    isError: query.error !== undefined,
    ...query,
  } as never);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReleaseLine", () => {
  it("renders nothing when no release topic is configured", () => {
    mockQuery({});
    const { container } = render(<ReleaseLine implementation={IMPLEMENTATION} topicId={null} network="testnet" />);

    expect(container.innerHTML).toBe("");
  });

  it("says a release vouches for the implementation, with a link to the topic", () => {
    mockQuery({ data: { status: "read", check: { matched: true, manifest: { version: "v2.0.0" } } } });
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    expect(screen.getByRole("status").textContent).toContain("Release v2.0.0 published on topic 0.0.4242");
    expect(screen.getByRole("status").className).toContain("text-success");
    expect(screen.getByRole("link", { name: "View the topic on HashScan" }).getAttribute("href")).toBe(
      "https://hashscan.io/testnet/topic/0.0.4242",
    );
  });

  it("warns when no release names the implementation", () => {
    mockQuery({
      data: { status: "read", check: { matched: false, reason: "", failure: "notNamed", searched: "topic" } },
    });
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    expect(screen.getByRole("status").textContent).toContain("No release on topic 0.0.4242 names this implementation.");
    expect(screen.getByRole("status").className).toContain("text-warning");
  });

  it("warns when the code no longer matches the release that names it", () => {
    mockQuery({
      data: { status: "read", check: { matched: false, reason: "", failure: "codeChanged", versions: ["v2.0.0"] } },
    });
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    expect(screen.getByRole("status").textContent).toContain("does not match its hash");
  });

  it("warns that nothing on a topic without a submit key counts, and reads none of it", () => {
    mockQuery({ data: { status: "unsigned", reason: "noSubmitKey" } });
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    expect(screen.getByRole("status").textContent).toContain("Topic 0.0.4242 has no submit key");
    expect(screen.getByRole("status").className).toContain("text-warning");
  });

  it("says the topic could not be read when the check fails", () => {
    mockQuery({ error: new ReleaseReadError("topic", new Error("503")) });
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    expect(screen.getByRole("status").textContent).toContain("Couldn't read the release topic 0.0.4242.");
  });

  it("points at the implementation, not the topic, when its code is what could not be read", () => {
    mockQuery({ error: new ReleaseReadError("implementation", new Error("404")) });
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    const line = screen.getByRole("status").textContent;
    expect(line).toContain("Couldn't read this implementation's code on the Mirror Node");
    expect(line).not.toContain("Couldn't read the release topic");
  });

  it("asks the check about this implementation on this topic", () => {
    mockQuery({});
    render(<ReleaseLine implementation={IMPLEMENTATION} topicId={TOPIC} network="testnet" />);

    expect(useReleaseCheck).toHaveBeenCalledWith(IMPLEMENTATION, TOPIC, { network: "testnet" });
    expect(screen.getByRole("status").textContent).toContain("Checking the releases on topic 0.0.4242…");
  });
});
