// @vitest-environment node
import { decodeRegistryOperation, decodeScheduledOperation } from "./decode";
import {
  PROPOSAL_REGISTRATION_BASE_GAS,
  buildCouncilRotation,
  buildCreateProposalCall,
  buildTreasuryTransfer,
  createProposalGas,
  encodeTokenAdmin,
  encodeTreasurySwap,
  encodeUpgrade,
  resolveCouncilMembers,
} from "./encode";
import { PROPOSAL_TYPES } from "./proposalTypes";
import { PROPOSAL_EXPIRY_SECONDS, buildExecuteProposalCall } from "./schedules";
import { scheduledBodyOf } from "./testUtils";
import { PrivateKey } from "@hiero-ledger/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAccount } from "~~/services/mirror";

vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchAccount: vi.fn(),
}));

const EXECUTOR = "0.0.10671156";
const GOVERNANCE_ACCOUNT = "0.0.10671146";
const GOVERNANCE_ACCOUNT_EVM = "0x0000000000000000000000000000000000a2d42a";
const ALICE = "0.0.10671142";
const DEMO_TOKEN_ID = "0.0.10671171";
const VAULT_PROXY = "0x3f806946439c3521eeD7d740c3f84E09888C0419";
const VAULT_V2 = "0xF3111f1480f088c19CB80096f698E5f1B42Cb9A6";
const ADAPTER = "0x1234567890AbcdEF1234567890aBcdef12345678";
const TOKEN_ADMIN = "0x9876543210FedCBA9876543210fEdcbA98765432";
/** Checksummed, which is how the decoder gives an address back whatever casing went in. */
const DEMO_TOKEN = "0x0000000000000000000000000000000000a2D463";
const HOLDER = "0x3353E89f1f9feF7A0881E5E92f8A0A7fd3A13097";
const USDC = "0x0000000000000000000000000000000000001549";

const NOW = new Date("2026-09-25T12:00:00Z");
const PROPOSAL_ID = 7;

/** What the council ends up signing: the registry proposal, scheduled as `execute(id)`. */
const scheduledExecuteOf = (proposal: { executeGas: number; payableTinybars: bigint }) =>
  decodeScheduledOperation(
    scheduledBodyOf(
      buildExecuteProposalCall({
        executorContractId: EXECUTOR,
        proposalId: PROPOSAL_ID,
        gas: proposal.executeGas,
        payableTinybars: proposal.payableTinybars,
      }),
    ),
  );

describe("createProposalGas", () => {
  /** Consumption measured on GovernedExecutor on testnet; the limit has to clear every one of them. */
  const measured = [
    { bytes: 4, consumed: 100_263 },
    { bytes: 36, consumed: 145_425 },
    { bytes: 100, consumed: 191_355 },
    { bytes: 196, consumed: 260_251 },
  ];

  it.each(measured)("covers the $consumed gas that $bytes bytes consumed on testnet", ({ bytes, consumed }) => {
    expect(createProposalGas(bytes)).toBeGreaterThan(consumed);
  });

  it("grows with the calldata, since the registry stores it", () => {
    expect(createProposalGas(196)).toBeGreaterThan(createProposalGas(4));
  });

  it("charges a whole word for a calldata shorter than one", () => {
    expect(createProposalGas(1)).toBe(createProposalGas(32));
  });

  it("asks for nothing beyond the base when there is no calldata at all", () => {
    expect(createProposalGas(0)).toBe(PROPOSAL_REGISTRATION_BASE_GAS);
  });
});

describe("encodeUpgrade", () => {
  it("registers the call against the proxy, which is what gates on the executor", () => {
    expect(encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 }).target).toBe(VAULT_PROXY);
  });

  it("comes back out of the decoder as the upgrade it went in as", () => {
    const proposal = encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 });

    expect(decodeRegistryOperation(proposal.target, proposal.calldata)).toEqual({
      kind: "upgrade",
      target: VAULT_PROXY,
      implementation: VAULT_V2,
      initializerCalldata: "0x",
    });
  });

  it("costs more to register when it carries an initializer", () => {
    const bare = encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 });
    const withInitializer = encodeUpgrade({
      proxy: VAULT_PROXY,
      implementation: VAULT_V2,
      initializerCalldata: "0x9623609d0000000000000000000000000000000000000000000000000000000000000001",
    });

    expect(withInitializer.registerGas).toBeGreaterThan(bare.registerGas);
  });

  it("schedules its execute at the limit measured for an upgrade", () => {
    const proposal = encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 });

    expect(scheduledExecuteOf(proposal)).toMatchObject({ gas: PROPOSAL_TYPES.upgrade.executeGas });
  });

  it("moves no HBAR", () => {
    expect(encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 }).payableTinybars).toBe(0n);
  });
});

describe("encodeTreasurySwap", () => {
  const swap = (overrides: Partial<Parameters<typeof encodeTreasurySwap>[0]> = {}) =>
    encodeTreasurySwap({
      adapter: ADAPTER,
      tokenOut: USDC,
      fee: 3000,
      recipient: GOVERNANCE_ACCOUNT_EVM,
      amountInTinybars: 200_000_000n,
      amountOutMinimum: 4_500_000n,
      ...overrides,
    });

  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("comes back out of the decoder as the swap it went in as", () => {
    const proposal = swap();

    expect(decodeRegistryOperation(proposal.target, proposal.calldata)).toMatchObject({
      kind: "treasurySwap",
      tokenOut: USDC,
      amountInTinybars: 200_000_000n,
      amountOutMinimum: 4_500_000n,
    });
  });

  /**
   * The adapter reverts with `ValueMismatch` unless the two agree, and they travel by different
   * routes: one in the registry entry, one on the scheduled transaction. This is the invariant the
   * encoder exists to hold.
   */
  it("pays the scheduled call exactly the HBAR its calldata says it sells", () => {
    const proposal = swap();
    const scheduled = scheduledExecuteOf(proposal);
    const registered = decodeRegistryOperation(proposal.target, proposal.calldata);

    expect(scheduled.kind === "registryCall" && scheduled.payableTinybars).toBe(
      registered.kind === "treasurySwap" && registered.amountInTinybars,
    );
  });

  it("gives the DEX until the proposal expires, not until a few minutes from now", () => {
    const proposal = swap();
    const registered = decodeRegistryOperation(proposal.target, proposal.calldata);

    expect(registered.kind === "treasurySwap" && registered.deadline).toBe(
      Math.floor(NOW.getTime() / 1000) + PROPOSAL_EXPIRY_SECONDS,
    );
  });

  it("refuses to sell nothing", () => {
    expect(() => swap({ amountInTinybars: 0n })).toThrow(/more than zero/);
  });

  it("refuses a swap with no floor, which would accept any price days later", () => {
    expect(() => swap({ amountOutMinimum: 0n })).toThrow(/floor/);
  });
});

describe("encodeTokenAdmin", () => {
  it("comes back out of the decoder as the operation it went in as", () => {
    const proposal = encodeTokenAdmin({ tokenAdmin: TOKEN_ADMIN, operation: "pause", token: DEMO_TOKEN });

    expect(decodeRegistryOperation(proposal.target, proposal.calldata)).toMatchObject({
      kind: "tokenAdmin",
      operation: "pause",
      token: DEMO_TOKEN,
      account: null,
    });
  });

  it("carries the holder a freeze acts on", () => {
    const proposal = encodeTokenAdmin({
      tokenAdmin: TOKEN_ADMIN,
      operation: "freeze",
      token: DEMO_TOKEN,
      account: HOLDER,
    });

    expect(decodeRegistryOperation(proposal.target, proposal.calldata)).toMatchObject({ account: HOLDER });
  });

  it("refuses a freeze with nobody to freeze", () => {
    expect(() => encodeTokenAdmin({ tokenAdmin: TOKEN_ADMIN, operation: "freeze", token: DEMO_TOKEN })).toThrow(
      /needs the account/,
    );
  });
});

describe("buildCreateProposalCall", () => {
  it("asks for the gas the proposal's own calldata needs", () => {
    const proposal = encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 });

    expect(buildCreateProposalCall(EXECUTOR, proposal).gas?.toNumber()).toBe(proposal.registerGas);
  });

  it("registers against the executor, not against the proposal's target", () => {
    const proposal = encodeUpgrade({ proxy: VAULT_PROXY, implementation: VAULT_V2 });

    expect(buildCreateProposalCall(EXECUTOR, proposal).contractId?.toString()).toBe(EXECUTOR);
  });
});

describe("buildTreasuryTransfer", () => {
  it("comes back out of the decoder with both sides of an HBAR payment", () => {
    const transfer = buildTreasuryTransfer({
      governanceAccountId: GOVERNANCE_ACCOUNT,
      recipientAccountId: ALICE,
      amount: 250_000_000n,
    });

    expect(decodeScheduledOperation(scheduledBodyOf(transfer))).toEqual({
      kind: "treasuryTransfer",
      // Ordered by account id, the way the network canonicalises a transfer list, not by the order
      // the two sides were added: the debited side is not necessarily first.
      hbar: [
        { accountId: ALICE, tinybars: 250_000_000n },
        { accountId: GOVERNANCE_ACCOUNT, tinybars: -250_000_000n },
      ],
      tokens: [],
    });
  });

  it("moves a token in its own smallest unit, leaving the decimals to whoever renders it", () => {
    const transfer = buildTreasuryTransfer({
      governanceAccountId: GOVERNANCE_ACCOUNT,
      recipientAccountId: ALICE,
      amount: 125n,
      tokenId: DEMO_TOKEN_ID,
    });

    expect(decodeScheduledOperation(scheduledBodyOf(transfer))).toMatchObject({
      hbar: [],
      tokens: [
        { tokenId: DEMO_TOKEN_ID, accountId: ALICE, amount: 125n },
        { tokenId: DEMO_TOKEN_ID, accountId: GOVERNANCE_ACCOUNT, amount: -125n },
      ],
    });
  });

  it("refuses to move nothing", () => {
    expect(() =>
      buildTreasuryTransfer({ governanceAccountId: GOVERNANCE_ACCOUNT, recipientAccountId: ALICE, amount: 0n }),
    ).toThrow(/more than zero/);
  });
});

describe("buildCouncilRotation", () => {
  const keysOf = (count: number) => Array.from({ length: count }, () => PrivateKey.generateECDSA().publicKey);

  it("comes back out of the decoder as the council it proposes", () => {
    const memberKeys = keysOf(3);
    const rotation = buildCouncilRotation({ governanceAccountId: GOVERNANCE_ACCOUNT, memberKeys, threshold: 2 });

    expect(decodeScheduledOperation(scheduledBodyOf(rotation))).toMatchObject({
      kind: "councilRotation",
      accountId: GOVERNANCE_ACCOUNT,
      council: { threshold: 2 },
    });
  });

  it("proposes every member it was given", () => {
    const rotation = buildCouncilRotation({
      governanceAccountId: GOVERNANCE_ACCOUNT,
      memberKeys: keysOf(5),
      threshold: 3,
    });
    const operation = decodeScheduledOperation(scheduledBodyOf(rotation));

    expect(operation.kind === "councilRotation" && operation.council.memberKeys).toHaveLength(5);
  });

  it("refuses a threshold no number of signatures could reach", () => {
    expect(() =>
      buildCouncilRotation({ governanceAccountId: GOVERNANCE_ACCOUNT, memberKeys: keysOf(3), threshold: 4 }),
    ).toThrow(/not reachable/);
  });

  it("refuses a council that approves on no signatures", () => {
    expect(() =>
      buildCouncilRotation({ governanceAccountId: GOVERNANCE_ACCOUNT, memberKeys: keysOf(3), threshold: 0 }),
    ).toThrow(/not reachable/);
  });

  it("refuses a council with no members", () => {
    expect(() =>
      buildCouncilRotation({ governanceAccountId: GOVERNANCE_ACCOUNT, memberKeys: [], threshold: 1 }),
    ).toThrow(/no members/);
  });

  it("refuses the same key in two seats, which would need more signers than it looks like", () => {
    const [key] = keysOf(1);

    expect(() =>
      buildCouncilRotation({ governanceAccountId: GOVERNANCE_ACCOUNT, memberKeys: [key, key], threshold: 2 }),
    ).toThrow(/same key twice/);
  });
});

describe("resolveCouncilMembers", () => {
  it("turns the account ids a person typed into the keys the rotation needs", async () => {
    const key = PrivateKey.generateECDSA().publicKey;
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: key.toStringRaw() },
    } as Awaited<ReturnType<typeof fetchAccount>>);

    const resolved = await resolveCouncilMembers([ALICE], "testnet");

    expect(resolved[0].toStringRaw()).toBe(key.toStringRaw());
  });
});
