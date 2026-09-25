// @vitest-environment node

/**
 * The proposal lifecycle against Hedera testnet, through the same signer port the UI uses. Opt-in:
 * it needs an operator exported in the shell and the fixtures `yarn setup` leaves in
 * `setup-state.json`, and skips itself when either is missing, so CI and the harness need no
 * credentials. The three steps run in order and share one schedule.
 *
 * Nothing here is charged to the governance account: the proposal never reaches its threshold, so the
 * scheduled call is withdrawn instead of executed and the seed proposal stays pending for the demo.
 */
import {
  buildExecuteProposalCall,
  buildProposalSchedule,
  buildScheduleDelete,
  buildScheduleSign,
  fetchAccountPublicKey,
  scheduleIdFromTransaction,
} from "./schedules";
import { Client, PrivateKey, type PublicKey } from "@hiero-ledger/sdk";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadState } from "~~/scripts/setup/state";
import { type MirrorSchedule, deriveScheduleState, fetchSchedule, fetchTransaction } from "~~/services/mirror";
import { type BurnerSigner, createBurnerSigner } from "~~/services/web3/burnerSigner";

const STATE_FILE = fileURLToPath(new URL("../../setup-state.json", import.meta.url));
const NETWORK = "testnet";

/** The vault upgrade consumes ~99k; nothing is charged because the proposal is withdrawn unexecuted. */
const UPGRADE_PROPOSAL_GAS = 300_000;

const MIRROR_ATTEMPTS = 16;
const MIRROR_DELAY_MS = 2500;
const STEP_TIMEOUT_MS = 90_000;

type Fixtures = {
  proposerId: string;
  proposerKey: PrivateKey;
  councilMemberId: string;
  councilMemberKey: PrivateKey;
  governanceAccountId: string;
  executorContractId: string;
  proposalId: number;
};

/** Null whenever anything is missing: the suite then skips instead of failing. */
function loadFixtures(): Fixtures | null {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!operatorId || !operatorKey) return null;

  const { governance, seedProposal, demoAccounts } = loadState(STATE_FILE, NETWORK);
  if (!governance || !seedProposal || !demoAccounts.alice) return null;

  return {
    proposerId: operatorId,
    proposerKey: PrivateKey.fromStringECDSA(operatorKey),
    councilMemberId: demoAccounts.alice.accountId,
    councilMemberKey: PrivateKey.fromStringDer(demoAccounts.alice.privateKey),
    governanceAccountId: governance.accountId,
    executorContractId: seedProposal.executorContractId,
    proposalId: seedProposal.id,
  };
}

const fixtures = loadFixtures();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Mirror answers 404 until it indexes, and returns stale rows for a few seconds after that. */
async function waitFor<T>(read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt <= MIRROR_ATTEMPTS; attempt++) {
    try {
      const value = await read();
      if (ready(value)) return value;
    } catch (error) {
      if (attempt === MIRROR_ATTEMPTS) throw error;
    }
    await sleep(MIRROR_DELAY_MS);
  }
  throw new Error("The Mirror Node did not catch up in time");
}

/** Mirror reports a signature by a prefix of the public key that produced it, base64 encoded. */
function isSignedBy(schedule: MirrorSchedule, publicKey: PublicKey): boolean {
  const key = publicKey.toStringRaw();
  return schedule.signatures.some(({ public_key_prefix }) =>
    key.startsWith(Buffer.from(public_key_prefix, "base64").toString("hex")),
  );
}

/** A client per signer: `createBurnerSigner` makes its key the operator of the client it is given. */
const clients: Client[] = [];

function signerFor(accountId: string, privateKey: PrivateKey) {
  const client = Client.forTestnet({ scheduleNetworkUpdate: false });
  clients.push(client);
  return createBurnerSigner({ privateKey, accountId, network: NETWORK, client });
}

/** `skipIf` still runs the suite body, so nothing may touch the fixtures until `beforeAll`. */
describe.skipIf(!fixtures)("the proposal lifecycle on testnet", () => {
  let ids: Fixtures;
  let proposer: BurnerSigner;
  let councilMember: BurnerSigner;
  let scheduleId: string;

  beforeAll(async () => {
    ids = fixtures as Fixtures;
    proposer = signerFor(ids.proposerId, ids.proposerKey);
    councilMember = signerFor(ids.councilMemberId, ids.councilMemberKey);

    const schedule = buildProposalSchedule({
      innerTransaction: buildExecuteProposalCall({
        executorContractId: ids.executorContractId,
        proposalId: ids.proposalId,
        gas: UPGRADE_PROPOSAL_GAS,
      }),
      governanceAccountId: ids.governanceAccountId,
      adminKey: await fetchAccountPublicKey(ids.proposerId, NETWORK),
      memo: `proposal ${ids.proposalId}`,
    });

    const { transactionId } = await proposer.executeTransaction(schedule);
    const rows = await waitFor(
      () => fetchTransaction(transactionId, { network: NETWORK }),
      rows => scheduleIdFromTransaction(rows) !== null,
    );
    scheduleId = scheduleIdFromTransaction(rows) as string;
  }, STEP_TIMEOUT_MS);

  afterAll(() => {
    for (const client of clients) client.close();
  });

  it(
    "opens a proposal the governance account pays for",
    async () => {
      const schedule = await waitFor(
        () => fetchSchedule(scheduleId, { network: NETWORK }),
        schedule => schedule.schedule_id === scheduleId,
      );

      expect(schedule.payer_account_id).toBe(ids.governanceAccountId);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "counts a council member's signature toward the threshold",
    async () => {
      await councilMember.executeTransaction(buildScheduleSign(scheduleId));

      const schedule = await waitFor(
        () => fetchSchedule(scheduleId, { network: NETWORK }),
        schedule => isSignedBy(schedule, ids.councilMemberKey.publicKey),
      );

      expect(deriveScheduleState(schedule).status).toBe("pending");
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "lets the proposer withdraw the proposal",
    async () => {
      await proposer.executeTransaction(buildScheduleDelete(scheduleId));

      const schedule = await waitFor(
        () => fetchSchedule(scheduleId, { network: NETWORK }),
        schedule => schedule.deleted,
      );

      expect(deriveScheduleState(schedule).status).toBe("deleted");
    },
    STEP_TIMEOUT_MS,
  );
});
