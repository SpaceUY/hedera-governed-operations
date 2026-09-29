/** A small governed world for the motion tests: three seats, two proposers, a vault, and a supplier a transfer pays. */
import { type CouncilKey, countThresholdSignatures } from "@sh/core/governance/council";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import type { MirrorSchedule, MirrorTransaction, ScheduleExecution } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { type GraphSnapshot, deriveGraphState } from "~~/services/liveMap/model/graph";

export const [ALICE, BOB, CAROL, DAVE] = ["YWxpY2U=", "Ym9i", "Y2Fyb2w=", "ZGF2ZQ=="];
export const GOVERNANCE = "0.0.4000";
export const SUPPLIER = "0.0.7000";
export const COUNCIL: CouncilKey = { threshold: 2, memberKeys: [ALICE, BOB, CAROL] };
export const INCOMING: CouncilKey = { threshold: 2, memberKeys: [ALICE, BOB, DAVE] };
/** Alice holds a seat and proposes; the operator proposes without one. */
export const PROPOSERS = [
  { accountId: "0.0.4101", key: ALICE },
  { accountId: "0.0.4001", key: null },
];
const VAULT_ADDRESS = "0x3f806946439c3521eeD7d740c3f84E09888C0419";

const NOW_SECONDS = 1_790_000_000;
/** A consensus timestamp this many seconds before the tests' now. */
export const ago = (seconds: number): string => `${NOW_SECONDS - seconds}.000000000`;

export const UPGRADE_CALL: ScheduledOperation = {
  kind: "registryCall",
  executorContractId: "0.0.5000",
  proposalId: 1,
  gas: 150_000,
  payableTinybars: 0n,
};

export const TRANSFER: ScheduledOperation = {
  kind: "treasuryTransfer",
  hbar: [
    { accountId: GOVERNANCE, tinybars: -4_000_000_000n },
    { accountId: SUPPLIER, tinybars: 4_000_000_000n },
  ],
  tokens: [],
};

export const ROTATION: ScheduledOperation = { kind: "councilRotation", accountId: GOVERNANCE, council: INCOMING };

/** A run whose scheduled transaction Mirror reports as successful. */
export const SUCCEEDED: ScheduleExecution = { status: "succeeded", transaction: {} as MirrorTransaction };

type Draft = {
  id: string;
  operation: ScheduledOperation;
  creator?: string;
  /** Member keys and when their row reached the schedule. */
  signatures?: Array<[string, string]>;
  executedAt?: string;
  execution?: ScheduleExecution;
};

/** A proposal as the inbox builds it; a registry call reads a pending vault upgrade entry. */
export function proposal({
  id,
  operation,
  creator = "0.0.4101",
  signatures = [],
  executedAt,
  execution = { status: "notRun" },
}: Draft): Proposal {
  const schedule: MirrorSchedule = {
    ...(executedSchedule as MirrorSchedule),
    schedule_id: id,
    creator_account_id: creator,
    consensus_timestamp: ago(30),
    executed_timestamp: executedAt ?? null,
    signatures: signatures.map(([key, at]) => ({
      consensus_timestamp: at,
      public_key_prefix: key,
      signature: "",
      type: "ED25519",
    })),
  };
  const pending = !executedAt;
  return {
    schedule,
    state: {
      status: pending ? "pending" : "executed",
      signatureCount: 0,
      executedAt: null,
      expiresAt: null,
      isSettled: !pending,
    },
    execution,
    progress: countThresholdSignatures(schedule, COUNCIL),
    incomingProgress:
      operation.kind === "councilRotation" ? countThresholdSignatures(schedule, operation.council) : null,
    operation,
    registry:
      operation.kind !== "registryCall"
        ? { status: "notApplicable" }
        : {
            status: "read",
            entry: {
              proposalId: 1,
              // A revert leaves the entry as it was; a run that succeeded marks it executed.
              state: pending || execution.status === "failed" ? "pending" : "executed",
              target: VAULT_ADDRESS,
              proposer: "0x0",
              calldata: "0x",
              operation: {
                kind: "upgrade",
                target: VAULT_ADDRESS,
                implementation: "0x0000000000000000000000000000000000a2d434",
                initializerCalldata: "0x",
                initializer: { kind: "none" },
              },
            },
          },
  };
}

/** One read of the world with these proposals, the council given or the default one. */
export function world(proposals: Proposal[], council: CouncilKey = COUNCIL): GovernanceSnapshot {
  return {
    council,
    proposers: PROPOSERS,
    proposals,
    unreachableProposers: [],
    treasury: { hbarBalanceTinybar: 100, demoTokenBalance: 0, usdcBalance: 0, vaultReserveTinybar: 0n },
    nodeStates: { vaultImplementation: null, tokenPaused: null },
  };
}

/** The graph the map would draw for `shown`. */
export function graphOf(shown: GovernanceSnapshot) {
  const snapshot: GraphSnapshot = {
    governanceAccountId: GOVERNANCE,
    executor: { ref: "0.0.5000" },
    council: shown.council,
    proposers: shown.proposers,
    entities: [{ id: "vault", role: "target", ref: "0.0.5001", evmAddress: VAULT_ADDRESS }],
    proposals: shown.proposals,
  };
  return deriveGraphState(snapshot);
}
