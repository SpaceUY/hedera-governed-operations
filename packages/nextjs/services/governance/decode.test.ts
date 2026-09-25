// @vitest-environment node
import recorded from "./__fixtures__/scheduled-bodies.json";
import { decodeRegistryOperation, decodeScheduledOperation } from "./decode";
import { describeRegistryOperation, describeScheduledOperation } from "./proposalTypes";
import { scheduledBodyOf } from "./testUtils";
import { proto } from "@hiero-ledger/proto";
import {
  AccountId,
  AccountUpdateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  KeyList,
  NftId,
  PrivateKey,
  TokenId,
  TopicId,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { encodeFunctionData, hexToBytes, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

const EXECUTOR = "0.0.10671156";
const GOVERNANCE_ACCOUNT = "0.0.10671146";
const VAULT_PROXY = "0x3f806946439c3521eeD7d740c3f84E09888C0419";
const VAULT_V2 = "0xF3111f1480f088c19CB80096f698E5f1B42Cb9A6";
const USDC = "0x0000000000000000000000000000000000001549";
const DEMO_TOKEN = "0x0000000000000000000000000000000000a2d463";
const HOLDER = "0x3353E89f1f9feF7A0881E5E92f8A0A7fd3A13097";

/** Bodies with no numeric field, for the degenerate shapes no SDK transaction can be built into. */
const rawBody = (body: proto.ISchedulableTransactionBody): string =>
  Buffer.from(proto.SchedulableTransactionBody.encode(body).finish()).toString("base64");

const reasonOf = (body: string): string => {
  const operation = decodeScheduledOperation(body);
  if (operation.kind !== "unrecognized") throw new Error(`expected an unrecognized body, got ${operation.kind}`);
  return operation.reason;
};

/**
 * The three recorded bodies come straight off testnet, so they pin the wire format the Mirror Node
 * actually serves rather than the one this package believes it serves.
 */
describe("decodeScheduledOperation on recorded testnet bodies", () => {
  it("reads the registry entry a contract-backed proposal runs", () => {
    expect(decodeScheduledOperation(recorded.registryCall.transactionBody)).toEqual({
      kind: "registryCall",
      executorContractId: EXECUTOR,
      proposalId: 7,
      gas: 150_000,
      payableTinybars: 0n,
    });
  });

  it("reads the council a rotation proposes, in the shape fetchCouncilKey returns", () => {
    expect(decodeScheduledOperation(recorded.councilRotation.transactionBody)).toMatchObject({
      kind: "councilRotation",
      accountId: "0.0.10716508",
      council: { threshold: 2 },
    });
  });

  it("names every member of the proposed council", () => {
    const operation = decodeScheduledOperation(recorded.councilRotation.transactionBody);

    expect(operation.kind === "councilRotation" && operation.council.memberKeys).toHaveLength(3);
  });

  it("reads both sides of a native treasury transfer", () => {
    expect(decodeScheduledOperation(recorded.treasuryTransfer.transactionBody)).toEqual({
      kind: "treasuryTransfer",
      hbar: [
        { accountId: "0.0.8192684", tinybars: -250_000_000n },
        { accountId: "0.0.10716495", tinybars: 250_000_000n },
      ],
      tokens: [],
    });
  });

  /**
   * The bytes the SDK writes are not identical to the ones Mirror serves — it spells out an empty
   * memo and zero shard and realm that the network leaves off the wire — so what has to match is
   * the operation, not the base64.
   */
  it("reads a body built here exactly as it reads the one testnet served", () => {
    const built = scheduledBodyOf(
      new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(EXECUTOR))
        .setGas(150_000)
        .setFunction("execute", new ContractFunctionParameters().addUint256(7)),
    );

    expect(decodeScheduledOperation(built)).toEqual(decodeScheduledOperation(recorded.registryCall.transactionBody));
  });

  it("ignores the memo, which whoever opened the proposal wrote by hand", () => {
    expect(describeScheduledOperation(decodeScheduledOperation(recorded.registryCall.transactionBody))).not.toContain(
      recorded.registryCall.memo,
    );
  });
});

describe("decodeScheduledOperation on bodies it cannot describe", () => {
  it("says so when the Mirror Node recorded no body", () => {
    expect(reasonOf("")).toContain("no body recorded");
  });

  it("says so when the body is not a scheduled transaction at all", () => {
    expect(reasonOf(Buffer.from([0xff, 0xff, 0xff, 0xff]).toString("base64"))).toContain("does not decode");
  });

  it("names the kind of transaction when it is none of the five", () => {
    const body = scheduledBodyOf(
      new TopicMessageSubmitTransaction().setTopicId(TopicId.fromString("0.0.10671141")).setMessage("hello"),
    );

    expect(reasonOf(body)).toContain("consensusSubmitMessage");
  });

  it("refuses a contract call that is not execute(uint256)", () => {
    const body = scheduledBodyOf(
      new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(EXECUTOR))
        .setGas(90_000)
        .setFunctionParameters(hexToBytes("0x12345678")),
    );

    expect(reasonOf(body)).toContain("0x12345678");
  });

  it("refuses a contract call with no calldata", () => {
    const body = scheduledBodyOf(
      new ContractExecuteTransaction().setContractId(ContractId.fromString(EXECUTOR)).setGas(90_000),
    );

    expect(reasonOf(body)).toContain("no calldata");
  });

  it("refuses an account update that leaves the key alone", () => {
    const body = scheduledBodyOf(
      new AccountUpdateTransaction().setAccountId(AccountId.fromString(GOVERNANCE_ACCOUNT)).setAccountMemo("renamed"),
    );

    expect(reasonOf(body)).toContain("rotates no council");
  });

  it("refuses a proposed key whose member could never be shown as approved", () => {
    const nested = new KeyList([PrivateKey.generateECDSA().publicKey], 1);
    const body = scheduledBodyOf(
      new AccountUpdateTransaction()
        .setAccountId(AccountId.fromString(GOVERNANCE_ACCOUNT))
        .setKey(new KeyList([nested], 1)),
    );

    expect(reasonOf(body)).toContain("not a council");
  });

  it("refuses a transfer of NFTs, which no encoder here builds", () => {
    const body = scheduledBodyOf(
      new TransferTransaction().addNftTransfer(
        new NftId(TokenId.fromString("0.0.10671171"), 1),
        AccountId.fromString(GOVERNANCE_ACCOUNT),
        AccountId.fromString("0.0.10671142"),
      ),
    );

    expect(reasonOf(body)).toContain("NFTs");
  });

  it("refuses a transfer that moves nothing", () => {
    expect(reasonOf(rawBody({ cryptoTransfer: {} }))).toContain("moves nothing");
  });

  it("refuses a contract call that names no contract", () => {
    expect(reasonOf(rawBody({ contractCall: {} }))).toContain("names no contract");
  });

  it("refuses an account update that names no account", () => {
    expect(reasonOf(rawBody({ cryptoUpdateAccount: {} }))).toContain("names no account");
  });
});

describe("decodeRegistryOperation", () => {
  const upgradeCalldata = (initializer: `0x${string}`) =>
    encodeFunctionData({
      abi: parseAbi(["function upgradeToAndCall(address newImplementation, bytes data)"]),
      functionName: "upgradeToAndCall",
      args: [VAULT_V2, initializer],
    });

  it("reads the implementation an upgrade points the proxy at", () => {
    expect(decodeRegistryOperation(VAULT_PROXY, upgradeCalldata("0x"))).toEqual({
      kind: "upgrade",
      target: VAULT_PROXY,
      implementation: VAULT_V2,
      initializerCalldata: "0x",
    });
  });

  it("keeps the initializer nested in an upgrade, which is what makes it expensive to register", () => {
    const initializer = "0x9623609d" as const;

    expect(decodeRegistryOperation(VAULT_PROXY, upgradeCalldata(initializer))).toMatchObject({
      initializerCalldata: initializer,
    });
  });

  it("reads the floor a treasury swap is approved against", () => {
    const calldata = encodeFunctionData({
      abi: parseAbi([
        "function swapExactHbarForToken(address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline)",
      ]),
      functionName: "swapExactHbarForToken",
      args: [USDC, 3000, HOLDER, 200_000_000n, 4_500_000n, 1_790_000_000n],
    });

    expect(decodeRegistryOperation(HOLDER, calldata)).toEqual({
      kind: "treasurySwap",
      target: HOLDER,
      tokenOut: USDC,
      fee: 3000,
      recipient: HOLDER,
      amountInTinybars: 200_000_000n,
      amountOutMinimum: 4_500_000n,
      deadline: 1_790_000_000,
    });
  });

  it("reads a token operation that acts on the token as a whole", () => {
    const calldata = encodeFunctionData({
      abi: parseAbi(["function pause(address token)"]),
      functionName: "pause",
      args: [DEMO_TOKEN],
    });

    expect(decodeRegistryOperation(HOLDER, calldata)).toMatchObject({ operation: "pause", account: null });
  });

  it("reads the account a freeze acts on", () => {
    const calldata = encodeFunctionData({
      abi: parseAbi(["function freeze(address token, address account)"]),
      functionName: "freeze",
      args: [DEMO_TOKEN, HOLDER],
    });

    expect(decodeRegistryOperation(HOLDER, calldata)).toMatchObject({ operation: "freeze", account: HOLDER });
  });

  it("carries the calldata through when no selector matches, so the UI can still show it", () => {
    expect(decodeRegistryOperation(VAULT_PROXY, "0xdeadbeef")).toEqual({
      kind: "unrecognized",
      target: VAULT_PROXY,
      calldata: "0xdeadbeef",
      reason: expect.stringContaining("0xdeadbeef"),
    });
  });

  it("says so when the registry entry stores an empty call", () => {
    expect(decodeRegistryOperation(VAULT_PROXY, "0x")).toMatchObject({
      reason: "the registry entry stores no calldata",
    });
  });
});

describe("the default description", () => {
  it("says which registry entry a contract-backed proposal runs", () => {
    expect(describeScheduledOperation(decodeScheduledOperation(recorded.registryCall.transactionBody))).toBe(
      `Run entry 7 of the registry at ${EXECUTOR}`,
    );
  });

  it("leaves the debited side out of a transfer, which is the governance account itself", () => {
    expect(describeScheduledOperation(decodeScheduledOperation(recorded.treasuryTransfer.transactionBody))).toBe(
      "Transfer 2.5 ℏ to 0.0.10716495",
    );
  });

  it("states the threshold a rotation moves the council to", () => {
    expect(describeScheduledOperation(decodeScheduledOperation(recorded.councilRotation.transactionBody))).toContain(
      "2 of 3",
    );
  });

  it("explains itself when it cannot describe the operation", () => {
    expect(describeScheduledOperation({ kind: "unrecognized", reason: "a reason" })).toContain("a reason");
  });

  it("names the implementation an upgrade installs", () => {
    expect(
      describeRegistryOperation({
        kind: "upgrade",
        target: VAULT_PROXY,
        implementation: VAULT_V2,
        initializerCalldata: "0x",
      }),
    ).toBe(`Upgrade ${VAULT_PROXY} to the implementation at ${VAULT_V2}`);
  });
});
