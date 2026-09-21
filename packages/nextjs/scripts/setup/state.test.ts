// @vitest-environment node
import { emptyState, loadState, saveState } from "./state";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "setup-state-"));
  file = join(dir, "setup-state.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadState", () => {
  it("returns an empty state for the network when the file does not exist", () => {
    expect(loadState(file, "testnet")).toEqual(emptyState("testnet"));
  });

  it("round-trips what saveState wrote", () => {
    const state = {
      ...emptyState("testnet"),
      topicId: "0.0.7",
      demoAccounts: { alice: { accountId: "0.0.8", privateKey: "k", publicKey: "p", evmAddress: "0xa" } },
    };
    saveState(file, state);
    expect(loadState(file, "testnet")).toEqual(state);
  });

  it("rejects a state file written for another network", () => {
    writeFileSync(file, JSON.stringify({ ...emptyState("testnet"), network: "previewnet" }));
    expect(() => loadState(file, "testnet")).toThrow(/previewnet/);
  });

  it("rejects a state file with an unknown version", () => {
    writeFileSync(file, JSON.stringify({ ...emptyState("testnet"), version: 99 }));
    expect(() => loadState(file, "testnet")).toThrow(/version/);
  });
});
