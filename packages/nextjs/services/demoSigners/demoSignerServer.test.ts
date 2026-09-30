// @vitest-environment node
import {
  DEMO_SIGNER_REFUSALS,
  type DemoSignerEnvironment,
  demoSignerEnvironment,
  isAgentSeat,
  loadDemoSigners,
  parseDemoSignRequest,
  readAgentExclusion,
} from "./demoSignerServer";
import type { DemoMember } from "./demoSigners";
import { PrivateKey } from "@hiero-ledger/sdk";
import { fetchAccount } from "@sh/core/mirror";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hedera, hederaTestnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import scaffoldConfig from "~~/scaffold.config";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchAccount: vi.fn(),
}));

const alice = PrivateKey.generateECDSA();
const agent = PrivateKey.generateECDSA();
const rawOf = (key: PrivateKey) => Buffer.from(key.publicKey.toBytesRaw()).toString("base64");
const accountOf = (accountId: string, key: PrivateKey) => ({
  accountId,
  privateKey: key.toStringDer(),
  publicKey: key.publicKey.toStringDer(),
  evmAddress: `0x${key.publicKey.toEvmAddress()}`,
});

let workDir: string;
let environment: DemoSignerEnvironment;

function writeState(state: object) {
  writeFileSync(environment.stateFile, JSON.stringify({ version: 1, network: "testnet", ...state }));
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "demo-signer-server-"));
  environment = {
    stateFile: join(workDir, "setup-state.json"),
    nodeEnv: "development",
    network: "testnet",
    appChainId: hederaTestnet.id,
  };
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("loadDemoSigners", () => {
  it("loads each demo member setup wrote, with the account setup recorded for the agent", () => {
    writeState({ demoAccounts: { alice: accountOf("0.0.11", alice) }, agentAccount: accountOf("0.0.99", agent) });
    const demo = loadDemoSigners(environment);
    expect(demo.status).toBe("available");
    if (demo.status !== "available") return;
    expect(demo.signers.map(({ member }) => member)).toEqual([
      { name: "alice", accountId: "0.0.11", publicKey: rawOf(alice) },
    ]);
    expect(demo.recordedAgent?.accountId).toBe("0.0.99");
  });

  it("records no agent when setup wrote none, or one it cannot read an account from", () => {
    const signers = { alice: accountOf("0.0.11", alice) };
    writeState({ demoAccounts: signers });
    const none = loadDemoSigners(environment);
    expect(none.status === "available" && none.recordedAgent).toBeNull();

    writeState({ demoAccounts: signers, agentAccount: { privateKey: agent.toStringDer() } });
    const noAccount = loadDemoSigners(environment);
    expect(noAccount.status === "available" && noAccount.recordedAgent).toBeNull();

    writeState({ demoAccounts: signers, agentAccount: "0.0.99" });
    const notAnObject = loadDemoSigners(environment);
    expect(notAnObject.status === "available" && notAnObject.recordedAgent).toBeNull();
  });

  it("derives the public key rather than trusting the file", () => {
    const tampered = { ...accountOf("0.0.11", alice), publicKey: agent.publicKey.toStringDer() };
    writeState({ demoAccounts: { alice: tampered } });
    const demo = loadDemoSigners(environment);
    expect(demo.status === "available" && demo.signers[0].member.publicKey).toBe(rawOf(alice));
  });

  it("skips a key that does not parse, and is unavailable with none left", () => {
    writeState({ demoAccounts: { alice: { ...accountOf("0.0.11", alice), privateKey: "not a key" } } });
    expect(loadDemoSigners(environment)).toEqual({ status: "unavailable" });
  });

  it("is unavailable without a state file, or with one for another network or version", () => {
    expect(loadDemoSigners(environment)).toEqual({ status: "unavailable" });
    writeFileSync(environment.stateFile, JSON.stringify({ version: 1, network: "mainnet", demoAccounts: {} }));
    expect(loadDemoSigners(environment)).toEqual({ status: "unavailable" });
    writeFileSync(environment.stateFile, JSON.stringify({ version: 2, network: "testnet", demoAccounts: {} }));
    expect(loadDemoSigners(environment)).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the state file is not JSON or holds no demo accounts", () => {
    writeFileSync(environment.stateFile, "{ not json");
    expect(loadDemoSigners(environment)).toEqual({ status: "unavailable" });
    writeFileSync(environment.stateFile, JSON.stringify({ version: 1, network: "testnet" }));
    expect(loadDemoSigners(environment)).toEqual({ status: "unavailable" });
  });

  it("refuses any network but testnet", () => {
    writeState({ demoAccounts: { alice: accountOf("0.0.11", alice) } });
    expect(loadDemoSigners({ ...environment, network: "mainnet" })).toEqual({ status: "wrongNetwork" });
  });

  it("refuses an app that targets another network, whatever the server says", () => {
    writeState({ demoAccounts: { alice: accountOf("0.0.11", alice) } });
    expect(loadDemoSigners({ ...environment, appChainId: hedera.id })).toEqual({ status: "wrongNetwork" });
  });

  it("is unavailable in a production build, with no way to opt in", () => {
    writeState({ demoAccounts: { alice: accountOf("0.0.11", alice) } });
    vi.stubEnv("NEXT_PUBLIC_ENABLE_BURNER_SIGNER", "true");
    expect(loadDemoSigners({ ...environment, nodeEnv: "production" })).toEqual({ status: "unavailable" });
  });
});

describe("demoSignerEnvironment", () => {
  it("reads the app's target network from the scaffold config and defaults the server's to testnet", () => {
    vi.stubEnv("HEDERA_NETWORK", "");
    const read = demoSignerEnvironment();
    expect(read.appChainId).toBe(scaffoldConfig.targetNetworks[0].id);
    expect(read.network).toBe("testnet");
    expect(read.stateFile.endsWith("setup-state.json")).toBe(true);
  });

  it("reads the server's network and build mode as they are", () => {
    vi.stubEnv("HEDERA_NETWORK", "MAINNET");
    vi.stubEnv("NODE_ENV", "production");
    const read = demoSignerEnvironment();
    expect(read.network).toBe("mainnet");
    expect(read.nodeEnv).toBe("production");
  });
});

describe("readAgentExclusion", () => {
  const ecdsa = (key: PrivateKey) => ({ key: { _type: "ECDSA_SECP256K1", key: key.publicKey.toStringRaw() } });

  it("knows the configured agent by its account and the key the ledger holds for it", async () => {
    vi.mocked(fetchAccount).mockResolvedValue(ecdsa(agent) as never);
    await expect(readAgentExclusion("0.0.99", null)).resolves.toEqual({
      status: "known",
      agents: [{ accountId: "0.0.99", seat: rawOf(agent) }],
    });
  });

  it("falls back to the account setup recorded when no agent is configured, without a Mirror read", async () => {
    await expect(readAgentExclusion(null, accountOf("0.0.99", agent))).resolves.toEqual({
      status: "known",
      agents: [{ accountId: "0.0.99", seat: rawOf(agent) }],
    });
    expect(fetchAccount).not.toHaveBeenCalled();
  });

  it("keeps both when the configured agent and the recorded one differ", async () => {
    const other = PrivateKey.generateECDSA();
    vi.mocked(fetchAccount).mockResolvedValue(ecdsa(other) as never);
    const exclusion = await readAgentExclusion("0.0.98", accountOf("0.0.99", agent));
    expect(exclusion.status === "known" && exclusion.agents.map(({ accountId }) => accountId)).toEqual([
      "0.0.98",
      "0.0.99",
    ]);
  });

  it("is unknown when the agent is neither configured nor recorded", async () => {
    await expect(readAgentExclusion(null, null)).resolves.toEqual({ status: "unknown" });
  });

  it("is unreadable when the configured agent's account cannot be read", async () => {
    vi.mocked(fetchAccount).mockRejectedValue(new Error("Mirror down"));
    await expect(readAgentExclusion("0.0.99", accountOf("0.0.99", agent))).resolves.toEqual({
      status: "unreadable",
    });
  });

  it("knows a configured agent whose account holds no single key by its account id alone", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({ key: null } as never);
    await expect(readAgentExclusion("0.0.99", null)).resolves.toEqual({
      status: "known",
      agents: [{ accountId: "0.0.99", seat: null }],
    });
  });

  it("reads the configured agent from testnet, never from the cache", async () => {
    vi.mocked(fetchAccount).mockResolvedValue(ecdsa(agent) as never);
    await readAgentExclusion("0.0.99", null);
    expect(fetchAccount).toHaveBeenCalledWith("0.0.99", { network: "testnet", fetchOptions: { cache: "no-store" } });
  });
});

describe("isAgentSeat", () => {
  const member: DemoMember = { name: "bob", accountId: "0.0.12", publicKey: rawOf(alice) };

  it("is the agent's seat by account id", () => {
    expect(isAgentSeat(member, [{ accountId: "0.0.12", seat: null }])).toBe(true);
  });

  it("is the agent's seat by key, under another account id", () => {
    expect(isAgentSeat(member, [{ accountId: "0.0.99", seat: rawOf(alice) }])).toBe(true);
  });

  it("is not the agent's seat otherwise", () => {
    expect(isAgentSeat(member, [{ accountId: "0.0.99", seat: rawOf(agent) }])).toBe(false);
    expect(isAgentSeat(member, [])).toBe(false);
  });

  it("does not take a seatless agent for every member", () => {
    expect(isAgentSeat(member, [{ accountId: "0.0.99", seat: null }])).toBe(false);
  });
});

describe("parseDemoSignRequest", () => {
  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["a malformed schedule id", { scheduleId: "0.0.1; drop", member: "alice" }],
    ["no schedule id", { member: "alice" }],
    ["a member outside the allowlist", { scheduleId: "0.0.5", member: "mallory" }],
    ["the operator", { scheduleId: "0.0.5", member: "operator" }],
    ["the agent", { scheduleId: "0.0.5", member: "agent" }],
  ])("refuses %s", (_, body) => {
    expect(parseDemoSignRequest(body)).toBeNull();
  });

  it("trims the schedule id", () => {
    expect(parseDemoSignRequest({ scheduleId: " 0.0.5 ", member: "bob" })).toEqual({
      scheduleId: "0.0.5",
      member: "bob",
    });
  });
});

describe("DEMO_SIGNER_REFUSALS", () => {
  it("says why nobody is offered while the agent is unknown, and how to fix it", () => {
    expect(DEMO_SIGNER_REFUSALS.agentUnknown).toMatch(/NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID/);
    expect(DEMO_SIGNER_REFUSALS.agentUnknown).toMatch(/yarn setup/);
  });
});
