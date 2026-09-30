// @vitest-environment node
import { GET, POST } from "./route";
import { PrivateKey, ScheduleSignTransaction, Status, StatusError, TransactionId } from "@hiero-ledger/sdk";
import recorded from "@sh/core/governance/__fixtures__/scheduled-bodies.json";
import { type CouncilKey, fetchCouncilKey } from "@sh/core/governance/council";
import { decodeScheduledOperation } from "@sh/core/governance/decode";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import { type RegistryCrossCheck, type RegistryEntryState, fetchRegistryEntries } from "@sh/core/governance/registry";
import { MirrorNodeError, type MirrorSchedule, fetchAccount, fetchSchedule } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hederaTestnet } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOVERNANCE_CONTRACTS, getDeployedContract } from "~~/config/governanceConfig";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchSchedule: vi.fn(),
  fetchAccount: vi.fn(),
}));
vi.mock("@sh/core/governance/council", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/governance/council")>()),
  fetchCouncilKey: vi.fn(),
}));
vi.mock("@sh/core/governance/decode", async importOriginal => {
  const original = await importOriginal<typeof import("@sh/core/governance/decode")>();
  return { ...original, decodeScheduledOperation: vi.fn(original.decodeScheduledOperation) };
});
vi.mock("@sh/core/governance/registry", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/governance/registry")>()),
  fetchRegistryEntries: vi.fn(),
}));
vi.mock("~~/config/governanceConfig", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/config/governanceConfig")>()),
  getDeployedContract: vi.fn(),
}));

/** The executor and entry the recorded `registryCall` body names, read from it rather than copied. */
const RECORDED_CALL = decodeScheduledOperation(recorded.registryCall.transactionBody);
if (RECORDED_CALL.kind !== "registryCall") throw new Error("The recorded registry call no longer decodes as one");
const EXECUTOR_ID = RECORDED_CALL.executorContractId;
const PROPOSAL_ID = RECORDED_CALL.proposalId;

const GOVERNANCE_ACCOUNT_ID = "0.0.10590498";
const SCHEDULE_ID = "0.0.10590552";
const ACCOUNT_IDS = { alice: "0.0.10671142", bob: "0.0.10671143" } as const;
const AGENT_ACCOUNT_ID = "0.0.10671199";
const OTHER_MEMBER = "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W";
const FAR_FUTURE = "9999999999.000000000";

type Name = keyof typeof ACCOUNT_IDS;
const keys: Record<Name, PrivateKey> = { alice: PrivateKey.generateECDSA(), bob: PrivateKey.generateECDSA() };
const unrelatedAgentKey = PrivateKey.generateECDSA();
const rawOf = (key: PrivateKey) => Buffer.from(key.publicKey.toBytesRaw()).toString("base64");
const accountKeyOf = (key: PrivateKey) => ({ key: { _type: "ECDSA_SECP256K1", key: key.publicKey.toStringRaw() } });
const council: CouncilKey = { threshold: 2, memberKeys: [OTHER_MEMBER, rawOf(keys.alice), rawOf(keys.bob)] };

const accountOf = (accountId: string, key: PrivateKey) => ({
  accountId,
  privateKey: key.toStringDer(),
  publicKey: key.publicKey.toStringDer(),
  evmAddress: `0x${key.publicKey.toEvmAddress()}`,
});

const pendingProposal = (overrides: Partial<MirrorSchedule> = {}): MirrorSchedule => ({
  ...(executedSchedule as MirrorSchedule),
  payer_account_id: GOVERNANCE_ACCOUNT_ID,
  executed_timestamp: null,
  expiration_time: FAR_FUTURE,
  signatures: [],
  transaction_body: recorded.registryCall.transactionBody,
  ...overrides,
});

const registryEntry = (state: RegistryEntryState): Map<number, RegistryCrossCheck> =>
  new Map<number, RegistryCrossCheck>([
    [
      PROPOSAL_ID,
      {
        status: "read",
        entry: {
          proposalId: PROPOSAL_ID,
          state,
          target: "0x1111111111111111111111111111111111111111",
          proposer: "0x0000000000000000000000000000000000000001",
          calldata: "0x",
          operation: {
            kind: "upgrade",
            target: "0x11",
            implementation: "0x22",
            initializerCalldata: "0x",
            initializer: { kind: "none" },
          },
        },
      },
    ],
  ]);

let workDir: string;
let execute: ReturnType<typeof acceptSignatures>;

/** Setup's state file, with the demo members named and, optionally, the agent's recorded account. */
function writeState(names: readonly Name[] = ["alice", "bob"], agentAccount?: ReturnType<typeof accountOf>) {
  const demoAccounts = Object.fromEntries(names.map(name => [name, accountOf(ACCOUNT_IDS[name], keys[name])]));
  writeFileSync(
    join(workDir, "setup-state.json"),
    JSON.stringify({ version: 1, network: "testnet", demoAccounts, ...(agentAccount ? { agentAccount } : {}) }),
  );
}

/** Every body the route answered, swept after each test for any form of a private key. */
const answered: string[] = [];
async function read(response: Promise<Response>): Promise<Response> {
  const settled = await response;
  answered.push(await settled.clone().text());
  return settled;
}
const get = () => read(GET());
const post = (body: unknown, contentType = "application/json") =>
  read(
    POST(
      new Request("http://localhost/api/demo/signers", {
        method: "POST",
        headers: { "content-type": contentType },
        body: JSON.stringify(body),
      }),
    ),
  );
const postRaw = (body: string) =>
  read(
    POST(
      new Request("http://localhost/api/demo/signers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    ),
  );
const signAs = (member: Name) => post({ scheduleId: SCHEDULE_ID, member });

/** A refusal is only one if nothing was sent to the network. */
async function refusal(member: Name, status: number): Promise<Response> {
  const response = await signAs(member);
  expect(response.status).toBe(status);
  expect(execute).not.toHaveBeenCalled();
  return response;
}

/** What the network would receive: every test stubs it, so a guard that fails never reaches a real `ScheduleSign`. */
function acceptSignatures() {
  return vi.spyOn(ScheduleSignTransaction.prototype, "execute").mockImplementation(async function (
    this: ScheduleSignTransaction,
  ) {
    return {
      transactionId: this.transactionId!,
      getReceipt: vi.fn().mockResolvedValue({ status: Status.Success }),
    } as never;
  });
}

beforeEach(() => {
  execute = acceptSignatures();
  vi.stubEnv("NODE_ENV", "development");
  workDir = mkdtempSync(join(tmpdir(), "demo-signers-"));
  vi.spyOn(process, "cwd").mockReturnValue(workDir);
  vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", GOVERNANCE_ACCOUNT_ID);
  vi.stubEnv("NEXT_PUBLIC_DEMO_TOKEN_ID", "0.0.5");
  vi.stubEnv("NEXT_PUBLIC_SEED_PROPOSAL_ID", "1");
  vi.stubEnv("HEDERA_NETWORK", "testnet");
  // The agent on an account of its own, holding neither demo key: the setup this route is built for.
  vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", AGENT_ACCOUNT_ID);
  vi.mocked(fetchAccount).mockResolvedValue(accountKeyOf(unrelatedAgentKey) as never);
  vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal());
  vi.mocked(fetchCouncilKey).mockResolvedValue(council);
  vi.mocked(getDeployedContract).mockReturnValue({ hederaContractId: EXECUTOR_ID } as never);
  vi.mocked(fetchRegistryEntries).mockResolvedValue(registryEntry("pending"));
});

afterEach(() => {
  for (const text of answered.splice(0)) {
    for (const key of Object.values(keys)) {
      expect(text).not.toContain(key.toStringDer());
      expect(text).not.toContain(key.toStringRaw());
    }
  }
  rmSync(workDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/demo/signers", () => {
  it("answers an empty list, not an error, when setup has not run", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ members: [] });
  });

  it("lists Alice and Bob with their public keys only, once the agent has an account of its own", async () => {
    writeState();
    expect(await (await get()).json()).toEqual({
      members: [
        { name: "alice", accountId: ACCOUNT_IDS.alice, publicKey: rawOf(keys.alice) },
        { name: "bob", accountId: ACCOUNT_IDS.bob, publicKey: rawOf(keys.bob) },
      ],
    });
  });

  it("lists nobody in a production build, even with the keys on disk", async () => {
    writeState();
    vi.stubEnv("NODE_ENV", "production");
    expect(await (await get()).json()).toEqual({ members: [] });
  });

  it("lists nobody off testnet", async () => {
    writeState();
    vi.stubEnv("HEDERA_NETWORK", "mainnet");
    expect(await (await get()).json()).toEqual({ members: [] });
  });

  it("omits the member whose account is the agent's", async () => {
    writeState();
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", ACCOUNT_IDS.bob);
    vi.mocked(fetchAccount).mockResolvedValue(accountKeyOf(keys.bob) as never);
    const { members } = await (await get()).json();
    expect(members.map(({ name }: { name: string }) => name)).toEqual(["alice"]);
  });

  it("omits a member whose key is the agent account's, under another id", async () => {
    writeState();
    vi.mocked(fetchAccount).mockResolvedValue(accountKeyOf(keys.bob) as never);
    const { members } = await (await get()).json();
    expect(members.map(({ name }: { name: string }) => name)).toEqual(["alice"]);
  });

  it("falls back to the agent setup recorded when the variable is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", "");
    writeState(["alice", "bob"], accountOf(ACCOUNT_IDS.bob, keys.bob));
    const { members } = await (await get()).json();
    expect(members.map(({ name }: { name: string }) => name)).toEqual(["alice"]);
    expect(fetchAccount).not.toHaveBeenCalled();
  });

  it("offers nobody while no agent is configured or recorded, and says why", async () => {
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", "");
    writeState();
    const body = await (await get()).json();
    expect(body.members).toEqual([]);
    expect(body.unavailableReason).toMatch(/No co-signing agent is configured/);
  });

  it("lists nobody, and reads nothing, while the governance account is not configured", async () => {
    writeState();
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "");
    expect(await (await get()).json()).toEqual({ members: [] });
    expect(fetchAccount).not.toHaveBeenCalled();
  });

  it("offers nobody while the agent's account cannot be read, and says why", async () => {
    writeState();
    vi.mocked(fetchAccount).mockRejectedValue(new Error("Mirror down at 10.0.0.1"));
    const text = await (await get()).text();
    expect(JSON.parse(text).members).toEqual([]);
    expect(JSON.parse(text).unavailableReason).toMatch(/could not be read/);
    expect(text).not.toContain("10.0.0.1");
  });
});

describe("POST /api/demo/signers", () => {
  it("refuses mainnet with 403", async () => {
    writeState();
    vi.stubEnv("HEDERA_NETWORK", "mainnet");
    await refusal("alice", 403);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("answers 503 in a production build", async () => {
    writeState();
    vi.stubEnv("NODE_ENV", "production");
    await refusal("alice", 503);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("answers 503 when there are no demo keys", async () => {
    await refusal("alice", 503);
  });

  it("answers 503 when the governance account is not configured", async () => {
    writeState();
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "");
    await refusal("alice", 503);
  });

  it.each([
    ["a body that is not an object", "nope"],
    ["a malformed schedule id", { scheduleId: "0.0.1; drop", member: "alice" }],
    ["a missing schedule id", { member: "alice" }],
    ["a member outside the allowlist", { scheduleId: SCHEDULE_ID, member: "mallory" }],
    ["the operator as a member", { scheduleId: SCHEDULE_ID, member: "operator" }],
    ["the agent as a member", { scheduleId: SCHEDULE_ID, member: "agent" }],
  ])("answers 400 for %s", async (_, body) => {
    writeState();
    expect((await post(body)).status).toBe(400);
    expect(fetchSchedule).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON at all, and for an empty one", async () => {
    writeState();
    expect((await postRaw("{ not json")).status).toBe(400);
    expect((await postRaw("")).status).toBe(400);
    expect(fetchSchedule).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts JSON sent with a charset, and refuses a form that only mentions JSON", async () => {
    writeState();
    expect((await post({ scheduleId: SCHEDULE_ID, member: "alice" }, "Application/JSON; charset=utf-8")).status).toBe(
      200,
    );
    execute.mockClear();
    const form = await post({ scheduleId: SCHEDULE_ID, member: "alice" }, "multipart/form-data; x=application/json");
    expect(form.status).toBe(415);
    expect(execute).not.toHaveBeenCalled();
  });

  it("answers 415 for a body not sent as JSON, which a cross-origin page could send without a preflight", async () => {
    writeState();
    expect((await post({ scheduleId: SCHEDULE_ID, member: "alice" }, "text/plain")).status).toBe(415);
    expect(fetchSchedule).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("answers 503 for an allowed member whose key this server does not hold", async () => {
    writeState(["alice"]);
    await refusal("bob", 503);
  });

  it("refuses the agent's member with 403 before reading the schedule", async () => {
    writeState();
    vi.mocked(fetchAccount).mockResolvedValue(accountKeyOf(keys.bob) as never);
    const response = await refusal("bob", 403);
    expect((await response.json()).error).toMatch(/never signs for it/);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("refuses the agent's member with 403 when only setup recorded the agent, and still signs as the other", async () => {
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", "");
    writeState(["alice", "bob"], accountOf(ACCOUNT_IDS.bob, keys.bob));
    await refusal("bob", 403);
    expect(fetchSchedule).not.toHaveBeenCalled();
    expect((await signAs("alice")).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses to sign while no agent is configured or recorded, before reading the schedule", async () => {
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", "");
    writeState();
    const response = await refusal("alice", 503);
    expect((await response.json()).error).toMatch(/No co-signing agent is configured/);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("refuses rather than signs when the agent's account cannot be read", async () => {
    writeState();
    vi.mocked(fetchAccount).mockRejectedValue(new Error("Mirror down"));
    await refusal("alice", 502);
    expect(fetchSchedule).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("signs as Bob once the agent has an account of its own", async () => {
    writeState();
    expect((await signAs("bob")).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for a schedule Mirror does not know", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockRejectedValue(new MirrorNodeError(404, "https://mirror/x", "{}"));
    await refusal("alice", 404);
  });

  it("refuses a schedule the governance account does not pay for", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ payer_account_id: "0.0.666" }));
    const response = await refusal("alice", 409);
    expect((await response.json()).error).toMatch(/not paid by the governance account/);
  });

  it("refuses a schedule that already executed", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ executed_timestamp: "1789672160.550227105" }));
    const response = await refusal("alice", 409);
    expect((await response.json()).error).toMatch(/no longer collecting signatures/);
  });

  it("refuses a body the decoder does not recognise", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ transaction_body: "" }));
    const response = await refusal("alice", 409);
    expect((await response.json()).error).toMatch(/not a proposal the council can be asked to sign/);
  });

  it("refuses a proposal whose registry entry was cancelled, since its execution would revert", async () => {
    writeState();
    vi.mocked(fetchRegistryEntries).mockResolvedValue(registryEntry("cancelled"));
    await refusal("alice", 409);
    expect(fetchRegistryEntries).toHaveBeenCalledWith(
      [PROPOSAL_ID],
      expect.objectContaining({ executorContractId: EXECUTOR_ID }),
    );
  });

  it("refuses a registry call to a contract other than the deployed executor, without asking the relay", async () => {
    writeState();
    vi.mocked(getDeployedContract).mockReturnValue({ hederaContractId: "0.0.999" } as never);
    await refusal("alice", 409);
    expect(fetchRegistryEntries).not.toHaveBeenCalled();
  });

  it("answers 502 when the registry cannot be read", async () => {
    writeState();
    vi.mocked(fetchRegistryEntries).mockResolvedValue(
      new Map([[PROPOSAL_ID, { status: "unreachable", reason: "relay down at 10.0.0.1" }]]),
    );
    const response = await refusal("alice", 502);
    expect(await response.text()).not.toContain("10.0.0.1");
  });

  it("answers 502 when the council cannot be read", async () => {
    writeState();
    vi.mocked(fetchCouncilKey).mockRejectedValue(new Error("Mirror down"));
    await refusal("alice", 502);
  });

  it("answers 503 when the executor is not deployed", async () => {
    writeState();
    vi.mocked(getDeployedContract).mockImplementation(() => {
      throw new Error("GovernedExecutor is not deployed");
    });
    await refusal("alice", 503);
  });

  it("refuses when the member has already signed", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(
      pendingProposal({
        signatures: [
          { consensus_timestamp: "1.0", public_key_prefix: rawOf(keys.alice), signature: "…", type: "ECDSA_SECP256K1" },
        ],
      }),
    );
    await refusal("alice", 409);
  });

  it("refuses when the member no longer holds a seat", async () => {
    writeState();
    vi.mocked(fetchCouncilKey).mockResolvedValue({ threshold: 1, memberKeys: [OTHER_MEMBER] });
    await refusal("alice", 409);
  });

  it("signs with the member's key, paid by the member, and returns only the transaction id", async () => {
    writeState();
    const response = await signAs("alice");
    expect(response.status).toBe(200);
    const transaction = execute.mock.contexts[0] as ScheduleSignTransaction;
    expect(transaction.scheduleId?.toString()).toBe(SCHEDULE_ID);
    expect(transaction.transactionId?.accountId?.toString()).toBe(ACCOUNT_IDS.alice);
    const [client] = execute.mock.calls[0];
    expect(client.ledgerId?.toString()).toBe("testnet");
    expect(client.operatorAccountId?.toString()).toBe(ACCOUNT_IDS.alice);
    expect(client.operatorPublicKey?.toStringRaw()).toBe(keys.alice.publicKey.toStringRaw());
    expect(await response.json()).toEqual({ transactionId: transaction.transactionId!.toString() });
  });

  it("asks the ledger about testnet, with no cache, and the executor deployed on it", async () => {
    writeState();
    await signAs("alice");
    expect(fetchSchedule).toHaveBeenCalledWith(SCHEDULE_ID, {
      network: "testnet",
      fetchOptions: { cache: "no-store" },
    });
    expect(fetchCouncilKey).toHaveBeenCalledWith(GOVERNANCE_ACCOUNT_ID, "testnet");
    expect(getDeployedContract).toHaveBeenCalledWith(hederaTestnet.id, GOVERNANCE_CONTRACTS.executor);
  });

  it("signs a native proposal, which has no registry entry to ask", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(
      pendingProposal({ transaction_body: recorded.treasuryTransfer.transactionBody }),
    );
    expect((await signAs("alice")).status).toBe(200);
    expect(fetchRegistryEntries).not.toHaveBeenCalled();
  });

  describe("a council rotation, which waits on both councils", () => {
    const incomingOnly = { threshold: 1, memberKeys: [OTHER_MEMBER, rawOf(keys.bob)] };
    const currentCouncil: CouncilKey = { threshold: 1, memberKeys: [OTHER_MEMBER, rawOf(keys.alice)] };
    const aliceSigned = {
      consensus_timestamp: "1.0",
      public_key_prefix: rawOf(keys.alice),
      signature: "…",
      type: "ECDSA_SECP256K1",
    };
    const rotation: ScheduledOperation = {
      kind: "councilRotation",
      accountId: GOVERNANCE_ACCOUNT_ID,
      council: incomingOnly,
    };

    beforeEach(() => {
      writeState();
      vi.mocked(fetchCouncilKey).mockResolvedValue(currentCouncil);
      vi.mocked(decodeScheduledOperation).mockReturnValue(rotation);
    });

    it("signs for a member only the incoming council seats, while that council still waits on it", async () => {
      vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ signatures: [aliceSigned] as never }));
      expect((await signAs("bob")).status).toBe(200);
    });

    it("refuses that member once the incoming council has its signature", async () => {
      const bobSigned = { ...aliceSigned, public_key_prefix: rawOf(keys.bob) };
      vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ signatures: [aliceSigned, bobSigned] as never }));
      await refusal("bob", 409);
    });
  });

  it("repeats a network refusal by its status code", async () => {
    writeState();
    vi.spyOn(ScheduleSignTransaction.prototype, "execute").mockRejectedValue(
      new StatusError(
        { status: Status.InvalidScheduleId, transactionId: TransactionId.generate(ACCOUNT_IDS.alice) },
        "internal detail",
      ),
    );
    const response = await signAs("alice");
    expect(response.status).toBe(409);
    const { error } = await response.json();
    expect(error).toContain("INVALID_SCHEDULE_ID");
    expect(error).not.toContain("internal detail");
  });

  it("hides any other failure behind a generic 502", async () => {
    writeState();
    vi.spyOn(ScheduleSignTransaction.prototype, "execute").mockRejectedValue(new Error("socket hang up at 10.0.0.1"));
    const response = await signAs("alice");
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("10.0.0.1");
  });
});
