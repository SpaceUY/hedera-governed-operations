/** A small governed system for the map's tests: three seats, one of them proposing, and the configured contracts. */
import type { GraphSnapshot } from "~~/services/governance/graph";
import { governanceEntities } from "~~/services/governance/graphEntities";
import type { Proposal } from "~~/services/governance/proposals";
import type { MirrorSchedule } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

export const [KEY_A, KEY_B, KEY_C] = ["YWxpY2U=", "Ym9i", "Y2Fyb2w="];

export const MAP_SNAPSHOT: GraphSnapshot = {
  governanceAccountId: "0.0.4000",
  executor: { ref: "0.0.5000", evmAddress: "0x5aF0000000000000000000000000000000000000" },
  council: { threshold: 2, memberKeys: [KEY_A, KEY_B, KEY_C] },
  proposers: [
    { accountId: "0.0.4101", key: KEY_A },
    { accountId: "0.0.4102", key: KEY_B },
    { accountId: "0.0.4103", key: KEY_C },
  ],
  entities: governanceEntities({
    vault: { address: "0x3f806946439c3521eeD7d740c3f84E09888C0419", hederaContractId: "0.0.5001" },
    tokenAdmin: { address: "0x5aF0000000000000000000000000000000000002", hederaContractId: "0.0.5002" },
    swapAdapter: { address: "0x5aF0000000000000000000000000000000000003" },
    tokenId: "0.0.6000",
    routerId: "0.0.1414040",
  }),
  proposals: [],
};

/** The same system with the proposer `yarn setup` adds that holds no seat: the operator that ran it. */
export const MAP_SNAPSHOT_WITH_OPERATOR: GraphSnapshot = {
  ...MAP_SNAPSHOT,
  proposers: [...MAP_SNAPSHOT.proposers, { accountId: "0.0.4001", key: "b3BlcmF0b3I=" }],
};

/** A pending transfer of 40 HBAR from the governance account to `recipient`. */
export function pendingTransferTo(recipient: string): Proposal {
  return {
    schedule: { ...executedSchedule, schedule_id: "0.0.9000" } as MirrorSchedule,
    state: { status: "pending", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: false },
    progress: { signed: 0, threshold: 2, signedBy: [] },
    incomingProgress: null,
    execution: { status: "notRun" },
    operation: {
      kind: "treasuryTransfer",
      hbar: [
        { accountId: MAP_SNAPSHOT.governanceAccountId, tinybars: -4_000_000_000n },
        { accountId: recipient, tinybars: 4_000_000_000n },
      ],
      tokens: [],
    },
    registry: { status: "notApplicable" },
  };
}
