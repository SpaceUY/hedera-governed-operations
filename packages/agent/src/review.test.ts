import type { Policy } from "./policy";
import { type ReviewOptions, decide, reviewInbox } from "./review";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal, ProposalInbox } from "@sh/core/governance/proposals";
import type { RegistryEntry } from "@sh/core/governance/registry";
import type { MirrorSchedule } from "@sh/core/mirror";
import { describe, expect, it, vi } from "vitest";

const EXECUTOR = "0.0.7001";
const EXECUTOR_EVM = "0x0000000000000000000000000000000000001b59";
const VAULT = "0x0000000000000000000000000000000000001234" as const;
const IMPLEMENTATION = "0x0000000000000000000000000000000000005678" as const;
const STRANGER = "0x00000000000000000000000000000000000000ff" as const;
const PROPOSER = "0x0000000000000000000000000000000000009001" as const;

/** Raw hex, the form `PrivateKey.publicKey.toStringRaw()` returns and `isSignedByKey` compares against. */
const AGENT_KEY_HEX = "02a1b2c3d4e5f6071829304152637485960718293041526374859607182930415263";
/** The same bytes base64-encoded, the form Mirror records a signature prefix in. */
const AGENT_KEY_PREFIX_BASE64 = Buffer.from(AGENT_KEY_HEX, "hex").toString("base64");

const POLICY: Policy = {
  upgrade: { targets: [VAULT], implementations: [IMPLEMENTATION] },
};

const OPTIONS: ReviewOptions = {
  executorContractId: EXECUTOR,
  agentPublicKeyHex: AGENT_KEY_HEX,
  policy: POLICY,
  signedThisRun: new Set(),
};

function schedule(overrides: Partial<MirrorSchedule> = {}): MirrorSchedule {
  return {
    schedule_id: "0.0.9001",
    creator_account_id: "0.0.1001",
    payer_account_id: "0.0.1002",
    consensus_timestamp: "1700000000.000000000",
    executed_timestamp: null,
    expiration_time: null,
    deleted: false,
    memo: "",
    wait_for_expiry: false,
    admin_key: null,
    signatures: [],
    transaction_body: "",
    ...overrides,
  };
}

const registryCall: ScheduledOperation = {
  kind: "registryCall",
  executorContractId: EXECUTOR,
  proposalId: 7,
  gas: 150_000,
  payableTinybars: 0n,
};

const UPGRADE_ENTRY: RegistryEntry = {
  proposalId: 7,
  state: "pending",
  target: VAULT,
  proposer: PROPOSER,
  calldata: "0x",
  operation: {
    kind: "upgrade",
    target: VAULT,
    implementation: IMPLEMENTATION,
    initializerCalldata: "0x",
    initializer: { kind: "none" },
  },
};

/** The registry side of a proposal, defaulting to a pending upgrade the policy allows. */
const entry = (overrides: Partial<RegistryEntry> = {}): Proposal["registry"] => ({
  status: "read",
  entry: { ...UPGRADE_ENTRY, ...overrides },
});

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    schedule: schedule(),
    state: { status: "pending", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: false },
    progress: { signed: 1, threshold: 2, signedBy: [] },
    execution: { status: "notRun" },
    incomingProgress: null,
    operation: registryCall,
    registry: entry(),
    ...overrides,
  };
}

describe("a proposal that needs nothing", () => {
  it("is skipped once it has settled, whatever the policy would have said", () => {
    const settled = proposal({
      state: { status: "executed", signatureCount: 2, executedAt: new Date(), expiresAt: null, isSettled: true },
    });
    const decision = decide(settled, OPTIONS);
    expect(decision.outcome).toBe("skipped");
    expect(decision.reason).toContain("already executed");
  });

  it("is skipped when this agent's key is already on it, so a second pass does not pay to sign twice", () => {
    const signed = proposal({
      schedule: schedule({
        signatures: [
          {
            consensus_timestamp: "1700000001.000000000",
            public_key_prefix: AGENT_KEY_PREFIX_BASE64,
            signature: "",
            type: "ECDSA_SECP256K1",
          },
        ],
      }),
    });
    expect(decide(signed, OPTIONS)).toMatchObject({ outcome: "skipped", reason: "already signed by this agent" });
  });

  it("is skipped while a signature this run has not reached Mirror yet", () => {
    // Mirror lags consensus by seconds and the agent polls faster, so the schedule still reads as
    // unsigned. Without this memory the agent pays to sign the same proposal on every pass.
    const options: ReviewOptions = { ...OPTIONS, signedThisRun: new Set(["0.0.9001"]) };
    const decision = decide(proposal(), options);
    expect(decision.outcome).toBe("skipped");
    expect(decision.reason).toContain("not yet on Mirror");
  });

  it("is still decided when someone else signed it", () => {
    const signedByAnother = proposal({
      schedule: schedule({
        signatures: [
          {
            consensus_timestamp: "1700000001.000000000",
            public_key_prefix: Buffer.from("03ffffffffffffffff", "hex").toString("base64"),
            signature: "",
            type: "ECDSA_SECP256K1",
          },
        ],
      }),
    });
    expect(decide(signedByAnother, OPTIONS).outcome).toBe("approved");
  });
});

describe("a proposal the agent cannot read", () => {
  it("is refused when the scheduled body did not decode", () => {
    const unreadable = proposal({ operation: { kind: "unrecognized", reason: "a field nothing reads" } });
    const decision = decide(unreadable, OPTIONS);
    expect(decision.outcome).toBe("refused");
    expect(decision.reason).toContain("unreadable");
  });

  it("is refused when the call goes to some other executor", () => {
    const elsewhere = proposal({ operation: { ...registryCall, executorContractId: "0.0.8888" } });
    expect(decide(elsewhere, OPTIONS).reason).toContain("not this agent's executor");
  });

  it("accepts its own executor named as an EVM address", () => {
    const byAddress = proposal({ operation: { ...registryCall, executorContractId: EXECUTOR_EVM } });
    expect(decide(byAddress, OPTIONS).outcome).toBe("approved");
  });

  it("is refused when the registry has no such entry", () => {
    const missing = proposal({ registry: { status: "missing", reason: "proposal(id) reverted" } });
    expect(decide(missing, OPTIONS).reason).toContain("no entry");
  });

  it("is refused, not approved, when the registry could not be reached", () => {
    const unreachable = proposal({ registry: { status: "unreachable", reason: "relay timed out" } });
    const decision = decide(unreachable, OPTIONS);
    expect(decision.outcome).toBe("refused");
    expect(decision.reason).toContain("could not be read");
  });

  it("is refused when the entry is already cancelled, which the schedule does not show", () => {
    const cancelled = proposal({ registry: entry({ state: "cancelled" }) });
    expect(decide(cancelled, OPTIONS).reason).toContain("already cancelled");
  });

  it("is refused when the entry's own calldata did not decode", () => {
    const opaque = proposal({
      registry: entry({
        operation: { kind: "unrecognized", target: VAULT, calldata: "0xdead", reason: "unknown selector" },
      }),
    });
    expect(decide(opaque, OPTIONS).reason).toContain("entry is unreadable");
  });
});

describe("verifying a release before signing an upgrade", () => {
  const inbox = (proposals: Proposal[]): ProposalInbox => ({ proposals, unreachableProposers: [] });
  const matched = { matched: true, manifest: { version: "v2.0.0" } } as never;

  it("names the release in the reason once the deployed code matches it", async () => {
    const verify = vi.fn().mockResolvedValue(matched);
    const result = await reviewInbox(inbox([proposal()]), OPTIONS, null, verify);

    expect(verify).toHaveBeenCalledWith(IMPLEMENTATION);
    expect(result.decisions[0]).toMatchObject({ outcome: "approved", reason: "within policy, release v2.0.0" });
  });

  it("turns an approval into a refusal when the code is not what the release published", async () => {
    const verify = vi.fn().mockResolvedValue({ matched: false, reason: "the code at 0x… does not match" });
    const sign = vi.fn();

    const result = await reviewInbox(inbox([proposal()]), OPTIONS, sign, verify);

    expect(result.decisions[0]).toMatchObject({ outcome: "refused", reason: "the code at 0x… does not match" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("refuses when the check itself could not run: not run is not passed", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("Mirror 503"));
    const result = await reviewInbox(inbox([proposal()]), OPTIONS, null, verify);
    expect(result.decisions[0]).toMatchObject({ outcome: "refused" });
    expect(result.decisions[0].reason).toContain("could not be verified");
  });

  it("does not run for a kind that is not an upgrade", async () => {
    const verify = vi.fn();
    const transfer = proposal({
      operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
      registry: { status: "notApplicable" },
    });
    await reviewInbox(inbox([transfer]), OPTIONS, null, verify);
    expect(verify).not.toHaveBeenCalled();
  });

  it("does not run on a proposal the policy already refused", async () => {
    const verify = vi.fn();
    const elsewhere = proposal({ operation: { ...registryCall, executorContractId: "0.0.8888" } });
    await reviewInbox(inbox([elsewhere]), OPTIONS, null, verify);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("reviewInbox", () => {
  const inbox = (proposals: Proposal[]): ProposalInbox => ({ proposals, unreachableProposers: [] });

  it("signs only what it approved", async () => {
    const sign = vi.fn().mockResolvedValue(undefined);
    const refused = proposal({
      schedule: schedule({ schedule_id: "0.0.9002" }),
      registry: entry({
        operation: {
          kind: "upgrade",
          target: STRANGER,
          implementation: IMPLEMENTATION,
          initializerCalldata: "0x",
          initializer: { kind: "none" },
        },
      }),
    });

    const result = await reviewInbox(inbox([proposal(), refused]), OPTIONS, sign);

    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith("0.0.9001");
    expect(result.decisions.map(d => d.outcome)).toEqual(["approved", "refused"]);
    expect(result.signed).toEqual(["0.0.9001"]);
  });

  it("signs nothing when no signer is given, which is what a dry run is", async () => {
    const result = await reviewInbox(inbox([proposal()]), OPTIONS, null);
    expect(result.decisions[0].outcome).toBe("approved");
    expect(result.failures).toEqual([]);
  });

  it("records a failed signature instead of throwing, so one bad schedule does not stop the pass", async () => {
    const sign = vi.fn().mockRejectedValueOnce(new Error("INVALID_SIGNATURE")).mockResolvedValueOnce(undefined);

    const result = await reviewInbox(
      inbox([proposal(), proposal({ schedule: schedule({ schedule_id: "0.0.9003" }) })]),
      OPTIONS,
      sign,
    );

    expect(sign).toHaveBeenCalledTimes(2);
    expect(result.failures).toEqual([{ scheduleId: "0.0.9001", error: "INVALID_SIGNATURE" }]);
    // A signature that did not land must not be remembered as one that did.
    expect(result.signed).toEqual(["0.0.9003"]);
  });

  it("passes through the proposers whose schedules could not be read", async () => {
    const partial: ProposalInbox = { proposals: [], unreachableProposers: ["0.0.5005"] };
    const result = await reviewInbox(partial, OPTIONS, null);
    expect(result.unreachableProposers).toEqual(["0.0.5005"]);
  });
});
