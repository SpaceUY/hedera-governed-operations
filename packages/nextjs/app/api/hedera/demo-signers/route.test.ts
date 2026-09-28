// @vitest-environment node
import { GET, POST } from "./route";
import { PrivateKey, ScheduleSignTransaction, Status, StatusError, TransactionId } from "@hiero-ledger/sdk";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeployedContract } from "~~/config/governanceConfig";
import recorded from "~~/services/governance/__fixtures__/scheduled-bodies.json";
import type { CouncilKey } from "~~/services/governance/council";
import { fetchCouncilKey } from "~~/services/governance/council";
import {
  type RegistryCrossCheck,
  type RegistryEntryState,
  fetchRegistryEntries,
} from "~~/services/governance/registry";
import { MirrorNodeError, type MirrorSchedule, fetchSchedule } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchSchedule: vi.fn(),
}));
vi.mock("~~/config/governanceConfig", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/config/governanceConfig")>()),
  getDeployedContract: vi.fn(),
}));
vi.mock("~~/services/governance/registry", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/governance/registry")>()),
  fetchRegistryEntries: vi.fn(),
}));
vi.mock("~~/services/governance/council", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/governance/council")>()),
  fetchCouncilKey: vi.fn(),
}));

const GOVERNANCE_ACCOUNT_ID = "0.0.10590498";
const SCHEDULE_ID = "0.0.10590552";
const ALICE_ACCOUNT_ID = "0.0.10671142";
/** The executor and entry the recorded `registryCall` body names. */
const EXECUTOR_ID = "0.0.10671156";
const PROPOSAL_ID = 7;
const OTHER_MEMBER = "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W";
const FAR_FUTURE = "9999999999.000000000";

const aliceKey = PrivateKey.generateECDSA();
const aliceRawKey = Buffer.from(aliceKey.publicKey.toBytesRaw()).toString("base64");
const council: CouncilKey = { threshold: 2, memberKeys: [OTHER_MEMBER, aliceRawKey] };

const pendingProposal = (overrides: Partial<MirrorSchedule> = {}): MirrorSchedule => ({
  ...executedSchedule,
  payer_account_id: GOVERNANCE_ACCOUNT_ID,
  executed_timestamp: null,
  expiration_time: FAR_FUTURE,
  signatures: [],
  transaction_body: recorded.registryCall.transactionBody,
  ...overrides,
});

const registryEntry = (state: RegistryEntryState): Map<number, RegistryCrossCheck> =>
  new Map([
    [
      PROPOSAL_ID,
      {
        status: "read",
        entry: {
          proposalId: PROPOSAL_ID,
          state,
          target: "0x1111111111111111111111111111111111111111",
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

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/hedera/demo-signers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const SIGN_ALICE = { scheduleId: SCHEDULE_ID, member: "alice" };

let workDir: string;

function writeState() {
  const alice = {
    accountId: ALICE_ACCOUNT_ID,
    privateKey: aliceKey.toStringDer(),
    publicKey: aliceKey.publicKey.toStringDer(),
    evmAddress: `0x${aliceKey.publicKey.toEvmAddress()}`,
  };
  writeFileSync(
    join(workDir, "setup-state.json"),
    JSON.stringify({ version: 1, network: "testnet", demoAccounts: { alice } }),
  );
}

/** Nothing the route answers may contain any form of the private key. */
function expectNoKeyIn(text: string) {
  expect(text).not.toContain(aliceKey.toStringDer());
  expect(text).not.toContain(aliceKey.toStringRaw());
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "demo-signers-"));
  vi.spyOn(process, "cwd").mockReturnValue(workDir);
  vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", GOVERNANCE_ACCOUNT_ID);
  vi.stubEnv("NEXT_PUBLIC_DEMO_TOKEN_ID", "0.0.5");
  vi.stubEnv("NEXT_PUBLIC_SEED_PROPOSAL_ID", "1");
  vi.stubEnv("HEDERA_NETWORK", "testnet");
  vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal());
  vi.mocked(fetchCouncilKey).mockResolvedValue(council);
  vi.mocked(getDeployedContract).mockReturnValue({ hederaContractId: EXECUTOR_ID } as never);
  vi.mocked(fetchRegistryEntries).mockResolvedValue(registryEntry("pending"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/hedera/demo-signers", () => {
  it("answers an empty list, not an error, when setup has not run", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ members: [] });
  });

  it("lists each demo member with its public key only", async () => {
    writeState();
    const response = await GET();
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({
      members: [{ name: "alice", accountId: ALICE_ACCOUNT_ID, publicKey: aliceRawKey }],
    });
    expectNoKeyIn(text);
  });

  it("lists nobody in a production build, even with the keys on disk", async () => {
    writeState();
    vi.stubEnv("NODE_ENV", "production");
    expect(await (await GET()).json()).toEqual({ members: [] });
  });
});

describe("POST /api/hedera/demo-signers", () => {
  it("refuses mainnet with 403", async () => {
    writeState();
    vi.stubEnv("HEDERA_NETWORK", "mainnet");
    const response = await post(SIGN_ALICE);
    expect(response.status).toBe(403);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("answers 503 when there are no demo keys", async () => {
    const response = await post(SIGN_ALICE);
    expect(response.status).toBe(503);
  });

  it("answers 503 when the governance account is not configured", async () => {
    writeState();
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "");
    expect((await post(SIGN_ALICE)).status).toBe(503);
  });

  it.each([
    ["a body that is not an object", "nope"],
    ["a malformed schedule id", { scheduleId: "0.0.1; drop", member: "alice" }],
    ["a missing schedule id", { member: "alice" }],
    ["a member outside the allowlist", { scheduleId: SCHEDULE_ID, member: "mallory" }],
    ["the operator as a member", { scheduleId: SCHEDULE_ID, member: "operator" }],
  ])("answers 400 for %s", async (_, body) => {
    writeState();
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("answers 415 for a body not sent as JSON, which a cross-origin page could send without a preflight", async () => {
    writeState();
    const response = await POST(
      new Request("http://localhost/api/hedera/demo-signers", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(SIGN_ALICE),
      }),
    );
    expect(response.status).toBe(415);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it("answers 503 for an allowed member whose key this server does not hold", async () => {
    writeState();
    expect((await post({ scheduleId: SCHEDULE_ID, member: "bob" })).status).toBe(503);
  });

  it("answers 404 for a schedule Mirror does not know", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockRejectedValue(new MirrorNodeError(404, "https://mirror/x", "{}"));
    expect((await post(SIGN_ALICE)).status).toBe(404);
  });

  it("refuses a schedule the governance account does not pay for", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ payer_account_id: "0.0.666" }));
    const response = await post(SIGN_ALICE);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/not paid by the governance account/);
  });

  it("refuses a schedule that already executed", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ executed_timestamp: "1789672160.550227105" }));
    expect((await post(SIGN_ALICE)).status).toBe(409);
  });

  it("refuses a body the decoder does not recognise", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(pendingProposal({ transaction_body: "" }));
    expect((await post(SIGN_ALICE)).status).toBe(409);
  });

  it("refuses a proposal whose registry entry was cancelled, since its execution would revert", async () => {
    writeState();
    vi.mocked(fetchRegistryEntries).mockResolvedValue(registryEntry("cancelled"));
    expect((await post(SIGN_ALICE)).status).toBe(409);
    expect(fetchRegistryEntries).toHaveBeenCalledWith(
      [PROPOSAL_ID],
      expect.objectContaining({ executorContractId: EXECUTOR_ID }),
    );
  });

  it("refuses a registry call to a contract other than the deployed executor", async () => {
    writeState();
    vi.mocked(getDeployedContract).mockReturnValue({ hederaContractId: "0.0.999" } as never);
    expect((await post(SIGN_ALICE)).status).toBe(409);
    expect(fetchRegistryEntries).not.toHaveBeenCalled();
  });

  it("answers 502 when the registry cannot be read", async () => {
    writeState();
    vi.mocked(fetchRegistryEntries).mockResolvedValue(
      new Map([[PROPOSAL_ID, { status: "unreachable", reason: "relay down at 10.0.0.1" }]]),
    );
    const response = await post(SIGN_ALICE);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("10.0.0.1");
  });

  it("answers 503 when the executor is not deployed", async () => {
    writeState();
    vi.mocked(getDeployedContract).mockImplementation(() => {
      throw new Error("GovernedExecutor is not deployed");
    });
    expect((await post(SIGN_ALICE)).status).toBe(503);
  });

  it("refuses when the member has already signed", async () => {
    writeState();
    vi.mocked(fetchSchedule).mockResolvedValue(
      pendingProposal({
        signatures: [
          { consensus_timestamp: "1.0", public_key_prefix: aliceRawKey, signature: "…", type: "ECDSA_SECP256K1" },
        ],
      }),
    );
    expect((await post(SIGN_ALICE)).status).toBe(409);
  });

  it("refuses when the member no longer holds a seat", async () => {
    writeState();
    vi.mocked(fetchCouncilKey).mockResolvedValue({ threshold: 1, memberKeys: [OTHER_MEMBER] });
    expect((await post(SIGN_ALICE)).status).toBe(409);
  });

  it("signs with the member's key, paid by the member, and returns only the transaction id", async () => {
    writeState();
    const execute = vi.spyOn(ScheduleSignTransaction.prototype, "execute").mockImplementation(async function (
      this: ScheduleSignTransaction,
    ) {
      return {
        transactionId: this.transactionId!,
        getReceipt: vi.fn().mockResolvedValue({ status: Status.Success }),
      } as never;
    });

    const response = await post(SIGN_ALICE);
    const text = await response.text();

    expect(response.status).toBe(200);
    const transaction = execute.mock.contexts[0] as ScheduleSignTransaction;
    expect(transaction.scheduleId?.toString()).toBe(SCHEDULE_ID);
    expect(transaction.transactionId?.accountId?.toString()).toBe(ALICE_ACCOUNT_ID);
    expect(JSON.parse(text)).toEqual({ transactionId: transaction.transactionId!.toString() });
    expectNoKeyIn(text);
  });

  it("repeats a network refusal by its status code", async () => {
    writeState();
    vi.spyOn(ScheduleSignTransaction.prototype, "execute").mockRejectedValue(
      new StatusError(
        { status: Status.InvalidScheduleId, transactionId: TransactionId.generate(ALICE_ACCOUNT_ID) },
        "internal detail",
      ),
    );
    const response = await post(SIGN_ALICE);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("INVALID_SCHEDULE_ID");
  });

  it("hides any other failure behind a generic 502", async () => {
    writeState();
    vi.spyOn(ScheduleSignTransaction.prototype, "execute").mockRejectedValue(new Error("socket hang up at 10.0.0.1"));
    const response = await post(SIGN_ALICE);
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain("10.0.0.1");
    expectNoKeyIn(text);
  });
});
