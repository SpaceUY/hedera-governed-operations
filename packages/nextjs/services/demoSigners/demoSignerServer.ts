/**
 * Demo only, server only: loads the demo co-signers' private keys and signs a proposal with one of
 * them. See `demoSigners.ts` for the feature and the two steps that remove it.
 *
 * The keys are read from `setup-state.json`, the file `yarn setup` already keeps them in, rather than
 * copied into environment variables: a second copy of a secret is one more place to leak it, and a
 * missing file is exactly the case the feature should switch itself off in (a fresh install, or a
 * deployed build that never ran setup). Two demo keys are two of the council's seats, so whoever can
 * call the route can pass a proposal the co-signing agent would refuse. The signers therefore exist
 * only on testnet, in an app that targets testnet, outside production builds — with no opt-in — and
 * never for the co-signing agent's seat; while the server cannot tell which seat that is, it signs for
 * nobody.
 */
import { type DemoMember, type DemoMemberName, type DemoSignRequest, awaitsSignatureFrom } from "./demoSigners";
import { Client, PrivateKey, StatusError } from "@hiero-ledger/sdk";
import { countThresholdSignatures, fetchCouncilKey, memberKeyOfAccount } from "@sh/core/governance/council";
import { decodeScheduledOperation } from "@sh/core/governance/decode";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import { unreadRegistry } from "@sh/core/governance/proposals";
import { type RegistryCrossCheck, fetchRegistryEntries } from "@sh/core/governance/registry";
import { buildScheduleSign } from "@sh/core/governance/schedules";
import { deriveScheduleState, fetchAccount, fetchSchedule, isMirrorNotFound, isValidEntityId } from "@sh/core/mirror";
import { join } from "node:path";
import { hederaTestnet } from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { DEMO_ACCOUNT_NAMES, type DemoAccount, loadState } from "~~/scripts/setup/state";
import { canBeSigned } from "~~/services/governance/proposalActions";
import { createBurnerSigner } from "~~/services/web3/burnerSigner";
import { getHederaRpcUrl } from "~~/utils/scaffold-hbar/networks";

/** The only network the demo accounts exist on: `yarn setup` refuses any other. */
const DEMO_NETWORK = "testnet";

const STATE_FILE_NAME = "setup-state.json";

/** What the route says when it will not sign for the reason named; fixed, so nothing internal leaks. */
export const DEMO_SIGNER_REFUSALS = {
  agentUnknown:
    "No co-signing agent is configured (NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID) or recorded by `yarn setup`, " +
    "so this server cannot tell which seat is the agent's and signs for no demo member. Run `yarn setup`.",
  agentUnreadable:
    "The co-signing agent's account could not be read from the Mirror Node, so no demo signature is sent. Try again.",
  agentSeat: "The co-signing agent signs by its own policy; this server never signs for it.",
} as const;

export type DemoSigner = { member: DemoMember; privateKey: PrivateKey };

/**
 * The co-signing agent's account as `yarn setup` may have recorded it in the state file: only what the
 * exclusion reads. It is parsed here rather than typed by `SetupState`, because the file is data this
 * server must not trust to be shaped as expected, and because an exclusion built on a field that is
 * missing or malformed has to fail closed (`unknown`), not throw.
 */
export type RecordedAgent = Pick<DemoAccount, "accountId" | "privateKey">;

export type DemoSigners =
  | { status: "available"; signers: DemoSigner[]; recordedAgent: RecordedAgent | null }
  | { status: "wrongNetwork" }
  | { status: "unavailable" };

export type DemoSignerEnvironment = {
  /** Absolute path of `setup-state.json`. */
  stateFile: string;
  nodeEnv: string | undefined;
  /** The server's `HEDERA_NETWORK`, lower-cased. */
  network: string;
  /** The chain the app targets (`scaffold.config.ts`): a mainnet-targeted app never lists demo members. */
  appChainId: number;
};

/**
 * Next.js runs route handlers with the package directory as the working directory (`yarn next:dev`
 * and `yarn next:serve` both start there), and `__dirname` means nothing once the route is bundled.
 */
export function demoSignerEnvironment(): DemoSignerEnvironment {
  return {
    stateFile: join(process.cwd(), STATE_FILE_NAME),
    nodeEnv: process.env.NODE_ENV,
    network: (process.env.HEDERA_NETWORK || DEMO_NETWORK).toLowerCase(),
    appChainId: scaffoldConfig.targetNetworks[0].id,
  };
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** The seat a DER private key signs as, derived rather than trusted from the public key beside it. */
function seatOfPrivateKey(privateKeyDer: string): { privateKey: PrivateKey; seat: string } | null {
  try {
    const privateKey = PrivateKey.fromStringDer(privateKeyDer);
    return { privateKey, seat: toBase64(privateKey.publicKey.toBytesRaw()) };
  } catch {
    return null;
  }
}

function demoSignerOf(name: DemoMemberName, account: DemoAccount): DemoSigner | null {
  const key = seatOfPrivateKey(account.privateKey);
  return key
    ? { member: { name, accountId: account.accountId, publicKey: key.seat }, privateKey: key.privateKey }
    : null;
}

function recordedAgentOf(state: object): RecordedAgent | null {
  const agent = "agentAccount" in state ? state.agentAccount : undefined;
  if (typeof agent !== "object" || agent === null) return null;
  const { accountId, privateKey } = agent as Partial<Record<keyof RecordedAgent, unknown>>;
  const recorded = {
    accountId: typeof accountId === "string" ? accountId.trim() : "",
    privateKey: typeof privateKey === "string" ? privateKey : "",
  };
  // Either half names the agent: an account id excludes by account, a key excludes by seat.
  return recorded.accountId || recorded.privateKey ? recorded : null;
}

type SetupKeys = { demoAccounts: Partial<Record<DemoMemberName, DemoAccount>>; recordedAgent: RecordedAgent | null };

function readSetupKeys(stateFile: string): SetupKeys {
  try {
    const state = loadState(stateFile, DEMO_NETWORK);
    return { demoAccounts: state.demoAccounts ?? {}, recordedAgent: recordedAgentOf(state) };
  } catch {
    // A state file from another version or network, or one that does not parse: no signers.
    return { demoAccounts: {}, recordedAgent: null };
  }
}

export function loadDemoSigners({ stateFile, nodeEnv, network, appChainId }: DemoSignerEnvironment): DemoSigners {
  if (network !== DEMO_NETWORK || appChainId !== hederaTestnet.id) return { status: "wrongNetwork" };
  // Fail closed: only the development server (and the test runner) may hold these keys, so a build
  // mode nobody thought of, or none at all, is refused like production.
  if (nodeEnv !== "development" && nodeEnv !== "test") return { status: "unavailable" };

  const { demoAccounts, recordedAgent } = readSetupKeys(stateFile);
  const signers = DEMO_ACCOUNT_NAMES.flatMap(name => {
    const account = demoAccounts[name];
    const signer = account ? demoSignerOf(name, account) : null;
    return signer ? [signer] : [];
  });
  return signers.length > 0 ? { status: "available", signers, recordedAgent } : { status: "unavailable" };
}

/** The co-signing agent as the server knows it: its account, and the seat its key would hold. */
export type AgentIdentity = { accountId: string; seat: string | null };

export type AgentExclusion =
  | { status: "known"; agents: readonly AgentIdentity[] }
  /** Neither configured nor recorded: the agent may still sit on a demo seat, so nobody is signed for. */
  | { status: "unknown" }
  /** Configured, but its account could not be read: nobody is signed for until it can be. */
  | { status: "unreadable" };

/**
 * Which accounts and seats the co-signing agent holds, from the two places that name it: the account
 * the app is told about (`NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID`, whose key is read from the Mirror
 * Node — the ledger, not the file, decides what it signs with) and the account `yarn setup` recorded
 * for it (whose key is derived from the private key in the state file). A configured account whose key
 * is not one public key has no seat to compare, so it excludes by account id only.
 */
export async function readAgentExclusion(
  configuredAccountId: string | null,
  recordedAgent: RecordedAgent | null,
): Promise<AgentExclusion> {
  const agents: AgentIdentity[] = [];
  if (configuredAccountId) {
    try {
      const account = await fetchAccount(configuredAccountId, {
        network: DEMO_NETWORK,
        fetchOptions: { cache: "no-store" },
      });
      agents.push({ accountId: configuredAccountId, seat: memberKeyOfAccount(account.key) });
    } catch {
      return { status: "unreadable" };
    }
  }
  if (recordedAgent) {
    agents.push({ accountId: recordedAgent.accountId, seat: seatOfPrivateKey(recordedAgent.privateKey)?.seat ?? null });
  }
  return agents.length > 0 ? { status: "known", agents } : { status: "unknown" };
}

/** Whether a demo member is the co-signing agent's, by account or by the key it signs with. */
export function isAgentSeat(member: DemoMember, agents: readonly AgentIdentity[]): boolean {
  return agents.some(({ accountId, seat }) => member.accountId === accountId || member.publicKey === seat);
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
 * The registry entry behind a call to this executor, read the way the rail reads it: `unreadRegistry`
 * says what a proposal is without a read (native, or a call naming another contract), and only a call
 * to this executor is read from the relay.
 */
async function readRegistryEntry(
  operation: ScheduledOperation,
  executorContractId: string,
): Promise<RegistryCrossCheck> {
  const unread = unreadRegistry(operation, executorContractId);
  if (unread.status !== "unreachable" || operation.kind !== "registryCall") return unread;
  const rpcUrl = getHederaRpcUrl(DEMO_NETWORK);
  const entries = await fetchRegistryEntries([operation.proposalId], { executorContractId, rpcUrl }).catch(() => null);
  return entries?.get(operation.proposalId) ?? unread;
}

/**
 * The same questions the rail asks before it shows the button, asked again here because the route can
 * be called without the rail. A schedule the governance account does not pay for is not a proposal,
 * whatever its body says; a body the decoder does not fully understand, or a registry entry that is no
 * longer pending, is never signed (`canBeSigned`): its execution would revert and bill gas. A registry
 * the relay cannot answer for is a 502 here, stricter than the button, which only warns.
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
  const state = deriveScheduleState(schedule);
  if (state.status !== "pending") return refuse(409, `Schedule ${scheduleId} is no longer collecting signatures.`);

  const operation = decodeScheduledOperation(schedule.transaction_body);
  const registry = await readRegistryEntry(operation, executorContractId);
  if (registry.status === "unreachable") return refuse(502, "The registry could not be read. Try again.");
  if (!canBeSigned({ state, operation, registry })) {
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
 * Submits the member's approval. The demo account pays for its own `ScheduleSign`, as a member signing
 * from a wallet would: approving is the member's act, not the app's, so the operator is not involved
 * and the route works without `HEDERA_OPERATOR_*`. `createBurnerSigner` waits for the receipt, so a
 * refusal surfaces as a `StatusError`.
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
