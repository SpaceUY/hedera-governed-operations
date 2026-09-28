/**
 * Demo only, server only: loads the demo members' private keys and signs a proposal with one of them.
 * See `demoSigners.ts` for what the feature is and the two steps that remove it.
 *
 * The keys are read from `setup-state.json`, the file `yarn setup` already keeps them in, rather than
 * copied into environment variables: a second copy of a secret is one more place to leak it, and a
 * missing file is exactly the case the feature should switch itself off in (a fresh install, or a
 * deployed build that never ran setup). Two demo keys are two of the council's three seats, so
 * whoever can call the route can pass any proposal: the signers therefore only exist on testnet and
 * outside production builds, which is what keeps them off a hosted instance even if the file were
 * bundled with it.
 */
import { type DemoMember, type DemoMemberName, type DemoSignRequest, awaitsSignatureFrom } from "./demoSigners";
import { Client, PrivateKey, StatusError } from "@hiero-ledger/sdk";
import { join } from "node:path";
import { DEMO_ACCOUNT_NAMES, type DemoAccount, loadState } from "~~/scripts/setup/state";
import { countThresholdSignatures, fetchCouncilKey } from "~~/services/governance/council";
import { decodeScheduledOperation } from "~~/services/governance/decode";
import { canBeSigned } from "~~/services/governance/proposalActions";
import type { ScheduledOperation } from "~~/services/governance/proposalTypes";
import { isThisExecutor, unreadRegistry } from "~~/services/governance/proposals";
import { type RegistryCrossCheck, fetchRegistryEntries } from "~~/services/governance/registry";
import { buildScheduleSign } from "~~/services/governance/schedules";
import { deriveScheduleState, fetchSchedule, isMirrorNotFound, isValidEntityId } from "~~/services/mirror";
import { createBurnerSigner } from "~~/services/web3/burnerSigner";
import { getHederaRpcUrl } from "~~/utils/scaffold-hbar/networks";

/** The only network the demo accounts exist on: `yarn setup` refuses any other. */
const DEMO_NETWORK = "testnet";

const STATE_FILE_NAME = "setup-state.json";

export type DemoSigner = { member: DemoMember; privateKey: PrivateKey };

export type DemoSigners =
  | { status: "available"; signers: DemoSigner[] }
  | { status: "wrongNetwork" }
  | { status: "unavailable" };

export type DemoSignerEnvironment = {
  /** Absolute path of `setup-state.json`. */
  stateFile: string;
  nodeEnv: string | undefined;
  /** The server's `HEDERA_NETWORK`, lower-cased. */
  network: string;
};

/**
 * Next.js runs route handlers with the package directory as the working directory (`yarn next:dev`
 * and `yarn next:serve` both start there), and `__dirname` means nothing once the route is bundled.
 */
export function demoSignerEnvironment(): DemoSignerEnvironment {
  return {
    stateFile: join(process.cwd(), STATE_FILE_NAME),
    nodeEnv: process.env.NODE_ENV,
    network: (process.env.HEDERA_NETWORK ?? DEMO_NETWORK).toLowerCase(),
  };
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** The public half is derived from the private key rather than trusted from the file next to it. */
function demoSignerOf(name: DemoMemberName, account: DemoAccount): DemoSigner | null {
  try {
    const privateKey = PrivateKey.fromStringDer(account.privateKey);
    return {
      member: { name, accountId: account.accountId, publicKey: toBase64(privateKey.publicKey.toBytesRaw()) },
      privateKey,
    };
  } catch {
    return null;
  }
}

function readDemoAccounts(stateFile: string): Partial<Record<DemoMemberName, DemoAccount>> {
  try {
    return loadState(stateFile, DEMO_NETWORK).demoAccounts;
  } catch {
    // A state file from another version or network, or one that does not parse: no signers.
    return {};
  }
}

export function loadDemoSigners({ stateFile, nodeEnv, network }: DemoSignerEnvironment): DemoSigners {
  if (network !== DEMO_NETWORK) return { status: "wrongNetwork" };
  if (nodeEnv === "production") return { status: "unavailable" };

  const accounts = readDemoAccounts(stateFile);
  const signers = DEMO_ACCOUNT_NAMES.flatMap(name => {
    const account = accounts[name];
    const signer = account ? demoSignerOf(name, account) : null;
    return signer ? [signer] : [];
  });
  return signers.length > 0 ? { status: "available", signers } : { status: "unavailable" };
}

function isDemoMemberName(value: unknown): value is DemoMemberName {
  return DEMO_ACCOUNT_NAMES.some(name => name === value);
}

/** The body of a sign request, or null when it is not one: a `0.0.x` schedule id and an allowed member. */
export function parseDemoSignRequest(body: unknown): DemoSignRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { scheduleId, member } = body as Record<string, unknown>;
  if (typeof scheduleId !== "string" || !isValidEntityId(scheduleId.trim())) return null;
  if (!isDemoMemberName(member)) return null;
  return { scheduleId: scheduleId.trim(), member };
}

export type SignableCheck = { signable: true } | { signable: false; status: 404 | 409 | 502; error: string };

/** The two ids that decide what a proposal is: who pays for it, and the registry it goes through. */
export type DemoGovernanceIds = { governanceAccountId: string; executorContractId: string };

type SignableCheckInput = DemoGovernanceIds & { scheduleId: string; member: DemoMember };

const refuse = (status: 404 | 409 | 502, error: string): SignableCheck => ({ signable: false, status, error });

async function readSchedule(scheduleId: string) {
  try {
    return await fetchSchedule(scheduleId, { network: DEMO_NETWORK, fetchOptions: { cache: "no-store" } });
  } catch (error) {
    return isMirrorNotFound(error) ? "notFound" : "unreachable";
  }
}

/**
 * The registry entry behind a call to our executor, read the way the detail page reads it. A body
 * that names any other contract comes back `missing`, which `canBeSigned` refuses.
 */
async function readRegistryEntry(
  operation: ScheduledOperation,
  executorContractId: string,
): Promise<RegistryCrossCheck> {
  if (operation.kind !== "registryCall" || !isThisExecutor(operation.executorContractId, executorContractId)) {
    return unreadRegistry(operation, executorContractId);
  }
  const rpcUrl = getHederaRpcUrl(DEMO_NETWORK);
  const entries = await fetchRegistryEntries([operation.proposalId], { executorContractId, rpcUrl });
  return entries.get(operation.proposalId) ?? { status: "unreachable", reason: "not returned" };
}

/**
 * The same questions the detail page asks before it shows the button, asked again here because the
 * route can be called without the page. A schedule the governance account does not pay for is not a
 * proposal, whatever its body says; a body the decoder does not fully understand, or a registry entry
 * that is no longer pending, is never signed (`canBeSigned`): its execution would revert and bill gas.
 */
export async function checkDemoSignable({
  scheduleId,
  member,
  governanceAccountId,
  executorContractId,
}: SignableCheckInput): Promise<SignableCheck> {
  const schedule = await readSchedule(scheduleId);
  if (schedule === "notFound") return refuse(404, `Schedule ${scheduleId} was not found on ${DEMO_NETWORK}.`);
  if (schedule === "unreachable") return refuse(502, "The Mirror Node could not be read. Try again.");

  if (schedule.payer_account_id !== governanceAccountId) {
    return refuse(409, `Schedule ${scheduleId} is not paid by the governance account, so it is not a proposal.`);
  }
  if (deriveScheduleState(schedule).status !== "pending") {
    return refuse(409, `Schedule ${scheduleId} is no longer collecting signatures.`);
  }
  const operation = decodeScheduledOperation(schedule.transaction_body);
  const registry = await readRegistryEntry(operation, executorContractId);
  if (registry.status === "unreachable") return refuse(502, "The registry could not be read. Try again.");
  if (!canBeSigned({ state: deriveScheduleState(schedule), operation, registry })) {
    return refuse(409, `Schedule ${scheduleId} is not a proposal the council can be asked to sign.`);
  }

  const council = await fetchCouncilKey(governanceAccountId, DEMO_NETWORK).catch(() => null);
  if (!council) return refuse(502, "The council could not be read from the Mirror Node. Try again.");
  const facts = {
    council,
    operation,
    progress: countThresholdSignatures(schedule, council),
    incomingProgress:
      operation.kind === "councilRotation" ? countThresholdSignatures(schedule, operation.council) : null,
  };
  if (!awaitsSignatureFrom(member.publicKey, facts)) {
    return refuse(409, `This proposal is not waiting for a signature from ${member.accountId}.`);
  }
  return { signable: true };
}

/**
 * Submits the member's approval. The demo account pays for its own `ScheduleSign`, as a member
 * signing from a wallet would: approving is the member's act, not the app's, so the operator is not
 * involved and the route works without `HEDERA_OPERATOR_*`.
 */
export async function submitDemoSignature({ privateKey, member }: DemoSigner, scheduleId: string): Promise<string> {
  const client = Client.forTestnet({ scheduleNetworkUpdate: false });
  try {
    const signer = createBurnerSigner({ privateKey, accountId: member.accountId, network: DEMO_NETWORK, client });
    const { transactionId } = await signer.executeTransaction(buildScheduleSign(scheduleId));
    return transactionId;
  } finally {
    client.close();
  }
}

/** A refusal the network gave (a status code such as `INVALID_SCHEDULE_ID`), which is safe to repeat. */
export function networkRefusalOf(error: unknown): string | null {
  return error instanceof StatusError ? error.status.toString() : null;
}
