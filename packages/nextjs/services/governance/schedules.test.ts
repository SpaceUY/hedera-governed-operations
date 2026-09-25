// @vitest-environment node
import scheduleCreateTransaction from "../mirror/__fixtures__/transaction.json";
import {
  MAX_PROPOSAL_EXPIRY_SECONDS,
  MAX_SCHEDULE_MEMO_BYTES,
  PROPOSAL_EXPIRY_SECONDS,
  buildExecuteProposalCall,
  buildProposalSchedule,
  buildScheduleDelete,
  buildScheduleSign,
  fetchAccountPublicKey,
  scheduleIdFromTransaction,
} from "./schedules";
import { PrivateKey } from "@hiero-ledger/sdk";
import { encodeFunctionData, parseAbi } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAccount } from "~~/services/mirror";

vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchAccount: vi.fn(),
}));

const GOVERNANCE_ACCOUNT_ID = "0.0.10671146";
const EXECUTOR_CONTRACT_ID = "0.0.10671156";
const SCHEDULE_ID = "0.0.10714227";
const NOW = new Date("2026-09-25T12:00:00Z");
const GAS = 300_000;

const proposerKey = PrivateKey.generateECDSA().publicKey;
const mockedFetchAccount = vi.mocked(fetchAccount);

/** A recorded create whose proposal executed, so Mirror answers with the create and its child call. */
const scheduleCreateRows = scheduleCreateTransaction.transactions;

const mirrorAccountWith = (key: { _type: string; key: string } | null) =>
  ({ key }) as Awaited<ReturnType<typeof fetchAccount>>;

const scheduleWith = (overrides: { memo?: string; expirySeconds?: number } = {}) =>
  buildProposalSchedule({
    innerTransaction: buildExecuteProposalCall({ executorContractId: EXECUTOR_CONTRACT_ID, proposalId: 3, gas: GAS }),
    governanceAccountId: GOVERNANCE_ACCOUNT_ID,
    adminKey: proposerKey,
    memo: "upgrade the vault",
    ...overrides,
  });

const expectedExpirySeconds = (seconds: number) => NOW.getTime() / 1000 + seconds;

describe("buildProposalSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("makes the governance account pay for the scheduled transaction", () => {
    expect(scheduleWith().payerAccountId?.toString()).toBe(GOVERNANCE_ACCOUNT_ID);
  });

  it("names the proposer's key as the only key that can delete the schedule", () => {
    expect(scheduleWith().adminKey?.toString()).toBe(proposerKey.toString());
  });

  it("carries the memo the proposal is listed by", () => {
    expect(scheduleWith().getScheduleMemo).toBe("upgrade the vault");
  });

  it("leaves the proposal open for a week by default", () => {
    expect(scheduleWith().expirationTime?.seconds.toNumber()).toBe(expectedExpirySeconds(PROPOSAL_EXPIRY_SECONDS));
  });

  it("accepts a shorter window", () => {
    expect(scheduleWith({ expirySeconds: 3600 }).expirationTime?.seconds.toNumber()).toBe(expectedExpirySeconds(3600));
  });

  it("runs the proposal as soon as the threshold is met instead of waiting for expiry", () => {
    expect(scheduleWith().waitForExpiry).toBe(false);
  });

  it("leaves the transaction unfrozen for the active signer to freeze", () => {
    expect(scheduleWith().isFrozen()).toBe(false);
  });

  it("rejects a memo the network would refuse", () => {
    expect(() => scheduleWith({ memo: "a".repeat(MAX_SCHEDULE_MEMO_BYTES + 1) })).toThrow(/memo is 101 bytes/);
  });

  it("counts memo length in bytes rather than characters", () => {
    expect(() => scheduleWith({ memo: "é".repeat(MAX_SCHEDULE_MEMO_BYTES) })).toThrow(/200 bytes/);
  });

  it("rejects an expiry past what HIP-423 allows", () => {
    expect(() => scheduleWith({ expirySeconds: MAX_PROPOSAL_EXPIRY_SECONDS + 1 })).toThrow(/HIP-423/);
  });

  it("rejects an expiry that has already passed", () => {
    expect(() => scheduleWith({ expirySeconds: 0 })).toThrow(/HIP-423/);
  });
});

describe("buildExecuteProposalCall", () => {
  const call = buildExecuteProposalCall({ executorContractId: EXECUTOR_CONTRACT_ID, proposalId: 3, gas: GAS });

  it("targets the proposal registry", () => {
    expect(call.contractId?.toString()).toBe(EXECUTOR_CONTRACT_ID);
  });

  it("runs the entry the council approved", () => {
    const expected = encodeFunctionData({
      abi: parseAbi(["function execute(uint256 id)"]),
      functionName: "execute",
      args: [3n],
    });
    expect(`0x${Buffer.from(call.functionParameters ?? []).toString("hex")}`).toBe(expected);
  });

  it("carries the gas the proposed operation needs", () => {
    expect(call.gas?.toNumber()).toBe(GAS);
  });
});

describe("scheduleIdFromTransaction", () => {
  it("reads the schedule id from the create row rather than from the scheduled child", () => {
    expect(scheduleIdFromTransaction(scheduleCreateRows)).toBe("0.0.10590552");
  });

  it("reports nothing while Mirror has not indexed the create yet", () => {
    expect(scheduleIdFromTransaction([])).toBeNull();
  });
});

describe("buildScheduleSign", () => {
  it("adds a signature to the pending proposal", () => {
    expect(buildScheduleSign(SCHEDULE_ID).scheduleId?.toString()).toBe(SCHEDULE_ID);
  });
});

describe("buildScheduleDelete", () => {
  it("withdraws the pending proposal", () => {
    expect(buildScheduleDelete(SCHEDULE_ID).scheduleId?.toString()).toBe(SCHEDULE_ID);
  });
});

describe("fetchAccountPublicKey", () => {
  afterEach(() => {
    mockedFetchAccount.mockReset();
  });

  it("reads the key of an account created from an ECDSA key", async () => {
    mockedFetchAccount.mockResolvedValue(
      mirrorAccountWith({ _type: "ECDSA_SECP256K1", key: proposerKey.toStringRaw() }),
    );

    expect((await fetchAccountPublicKey("0.0.10574825", "testnet")).toStringRaw()).toBe(proposerKey.toStringRaw());
  });

  it("reads the key of an ED25519 account", async () => {
    const ed25519 = PrivateKey.generateED25519().publicKey;
    mockedFetchAccount.mockResolvedValue(mirrorAccountWith({ _type: "ED25519", key: ed25519.toStringRaw() }));

    expect((await fetchAccountPublicKey("0.0.10574825", "testnet")).toStringRaw()).toBe(ed25519.toStringRaw());
  });

  it("explains why an account without a single key of its own cannot propose", async () => {
    mockedFetchAccount.mockResolvedValue(mirrorAccountWith({ _type: "ProtobufEncoded", key: "0a05" }));

    await expect(fetchAccountPublicKey("0.0.10671146", "testnet")).rejects.toThrow(/could never be withdrawn/);
  });
});
