/**
 * A proposal is a transaction the governance account pays for but cannot send on its own: its key is
 * a threshold key, so the network parks the scheduled transaction until m of n council members have
 * signed it. That makes `ScheduleSign` the vote, and the schedule id the identity of the proposal.
 *
 * Every function here only builds a transaction and leaves it unfrozen: the active signer freezes it
 * with a network client, which is what assigns node account ids (`services/web3/hederaSigner.ts`).
 */
import {
  AccountId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  type Key,
  PublicKey,
  ScheduleCreateTransaction,
  ScheduleDeleteTransaction,
  ScheduleSignTransaction,
  Timestamp,
  type Transaction,
} from "@hiero-ledger/sdk";
import { type MirrorTransaction, fetchAccount } from "~~/services/mirror";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/** How long a proposal stays open for signatures. Seven days is what the demo runs on. */
export const PROPOSAL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/** Longest expiry HIP-423 accepts; beyond it the network rejects the create. */
export const MAX_PROPOSAL_EXPIRY_SECONDS = 62 * 24 * 60 * 60;

export const MAX_SCHEDULE_MEMO_BYTES = 100;

/** How Mirror names the row of a `ScheduleCreate`. */
const SCHEDULE_CREATE_ROW = "SCHEDULECREATE";

export type ProposalScheduleOptions = {
  /** What the council approves. It has to be unfrozen: `setScheduledTransaction` rejects a frozen one. */
  innerTransaction: Transaction;
  /** Payer of the scheduled transaction, and the account whose threshold key the signatures add up to. */
  governanceAccountId: string;
  /**
   * The only key that can delete this schedule, so it decides who can withdraw the proposal. A
   * schedule created without one can never be deleted (`SCHEDULE_IS_IMMUTABLE`), and the network
   * requires the admin key to sign the create as well (`INVALID_SIGNATURE` otherwise) — which is why
   * this is the proposer's own key, read with `fetchAccountPublicKey`, and never the council's.
   */
  adminKey: Key;
  memo: string;
  expirySeconds?: number;
};

export type ExecuteProposalCallOptions = {
  executorContractId: string;
  proposalId: number;
  /**
   * Gas for the whole proposed operation, not for the registry's overhead: `execute` calls the
   * proposal's target. A scheduled call that succeeds is charged its entire limit, so this belongs to
   * the operation being proposed — an upgrade and a treasury swap are not the same number — and the
   * governance account pays for any headroom left unused.
   */
  gas: number;
};

function requireMemoFits(memo: string): void {
  const bytes = new TextEncoder().encode(memo).length;
  if (bytes > MAX_SCHEDULE_MEMO_BYTES) {
    throw new Error(`Schedule memo is ${bytes} bytes, over the ${MAX_SCHEDULE_MEMO_BYTES} the network accepts`);
  }
}

function requireExpiryInRange(expirySeconds: number): void {
  if (expirySeconds > 0 && expirySeconds <= MAX_PROPOSAL_EXPIRY_SECONDS) return;
  throw new Error(
    `A proposal can stay open between 1 second and ${MAX_PROPOSAL_EXPIRY_SECONDS} seconds (HIP-423), not ${expirySeconds}`,
  );
}

/**
 * Wraps a transaction in the proposal the council votes on. `waitForExpiry` is false, so the network
 * runs it the moment the threshold is met instead of holding it until it expires.
 */
export function buildProposalSchedule({
  innerTransaction,
  governanceAccountId,
  adminKey,
  memo,
  expirySeconds = PROPOSAL_EXPIRY_SECONDS,
}: ProposalScheduleOptions): ScheduleCreateTransaction {
  requireMemoFits(memo);
  requireExpiryInRange(expirySeconds);

  return new ScheduleCreateTransaction()
    .setScheduledTransaction(innerTransaction)
    .setPayerAccountId(AccountId.fromString(governanceAccountId))
    .setAdminKey(adminKey)
    .setScheduleMemo(memo)
    .setExpirationTime(Timestamp.fromDate(new Date(Date.now() + expirySeconds * 1000)))
    .setWaitForExpiry(false);
}

/** The call a registry proposal schedules: the executor runs entry `proposalId` against its target. */
export function buildExecuteProposalCall({
  executorContractId,
  proposalId,
  gas,
}: ExecuteProposalCallOptions): ContractExecuteTransaction {
  return new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(executorContractId))
    .setGas(gas)
    .setFunction("execute", new ContractFunctionParameters().addUint256(proposalId));
}

/**
 * One council member's approval. The signature lands on the pending schedule and counts toward the
 * governance account's threshold key; reaching it is what makes the network execute the proposal.
 */
export function buildScheduleSign(scheduleId: string): ScheduleSignTransaction {
  return new ScheduleSignTransaction().setScheduleId(scheduleId);
}

/**
 * Withdraws a pending approval, signed by the admin key the schedule was created with. This ends one
 * round of voting, not the proposal: the registry entry stays pending and can be scheduled again, so
 * retiring a proposal for good also means calling `cancel(id)` on the executor.
 */
export function buildScheduleDelete(scheduleId: string): ScheduleDeleteTransaction {
  return new ScheduleDeleteTransaction().setScheduleId(scheduleId);
}

/**
 * The id of the proposal a create left behind: signers return a transaction id, and the schedule id is
 * what identifies a proposal everywhere else. One transaction id can yield several Mirror rows — the
 * create, plus the scheduled child once the council's signatures run it — and only the create row
 * carries the schedule. Null while Mirror is still indexing.
 */
export function scheduleIdFromTransaction(rows: MirrorTransaction[]): string | null {
  return rows.find(row => row.name === SCHEDULE_CREATE_ROW)?.entity_id ?? null;
}

/**
 * Public key of an account, to be the admin key of the schedules it creates. It comes from the Mirror
 * Node because no signer hands it over: HashPack never exposes a key to the app, and asking consensus
 * would need an operator the browser does not have.
 */
export async function fetchAccountPublicKey(accountId: string, network: HederaNetworkName): Promise<PublicKey> {
  const { key } = await fetchAccount(accountId, { network });
  if (key?._type === "ECDSA_SECP256K1") return PublicKey.fromStringECDSA(key.key);
  if (key?._type === "ED25519") return PublicKey.fromStringED25519(key.key);
  throw new Error(
    `Account ${accountId} holds a ${key?._type ?? "missing"} key, so the proposals it creates could never be ` +
      "withdrawn: a proposal is retracted by the key that created it, and only an account with a single key has one.",
  );
}
