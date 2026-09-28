/**
 * The agent's configuration: its seat on the council from the environment, its limits from a JSON
 * file. The split is deliberate — the key and the ids are deployment, the policy is a document
 * somebody reviews and version-controls, and mounting it is the one thing an operator changes.
 *
 * Everything is validated at boot and nothing is defaulted silently. An agent that starts with a
 * policy it half understood would be worse than one that refuses to start: it holds a signing key,
 * and the failure mode of a misread limit is a signature nobody authorised.
 */
import type { Policy, TokenAdminRule } from "./policy";
import { decodeBase32 } from "./totp";
import { PrivateKey } from "@hiero-ledger/sdk";
import { type HederaNetworkName, parseHederaNetworkName } from "@sh/core/network";
import { readFileSync } from "node:fs";

const TOKEN_ADMIN_OPERATIONS = ["pause", "unpause", "freeze", "unfreeze"] as const;

const DEFAULT_POLL_INTERVAL_MS = 15_000;

/** Where confirmation codes arrive. Loopback, because this endpoint releases signatures. */
const DEFAULT_APPROVAL_HOST = "127.0.0.1";

const DEFAULT_APPROVAL_PORT = 8787;

const MAX_PORT = 65_535;

/** Below this the agent would poll Mirror harder than the network produces proposals. */
const MIN_POLL_INTERVAL_MS = 5_000;

export type AgentConfig = {
  network: HederaNetworkName;
  agentAccountId: string;
  agentKey: PrivateKey;
  governanceAccountId: string;
  executorContractId: string;
  /** JSON-RPC relay, for reading the registry entry behind a contract-backed proposal. */
  rpcUrl: string;
  pollIntervalMs: number;
  /** Decide and log, sign nothing. The way to try a new policy against a real inbox. */
  dryRun: boolean;
  policy: Policy;
  /** HCS topic every decision is published to. Its submit key has to be this agent's. */
  decisionTopicId: string;
  /**
   * The shared secret confirmation codes are generated from, decoded from its base32, or null when
   * the policy escalates nothing. It is never logged and never leaves this process.
   */
  confirmationSecret: Uint8Array | null;
  /** Where the confirmation endpoint listens. */
  approval: { host: string; port: number };
};

/**
 * Testnet is the default because that is what `yarn setup` builds, but a value that is neither name
 * is refused rather than read as testnet: the agent holds a key for one network, and the failure
 * mode of a typo is a process watching an inbox that will never contain the proposals it was
 * pointed at.
 */
function agentNetwork(): HederaNetworkName {
  const raw = process.env.HEDERA_NETWORK?.trim();
  if (!raw) return "testnet";
  return parseHederaNetworkName(raw, "HEDERA_NETWORK");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function pollInterval(): number {
  const raw = process.env.AGENT_POLL_INTERVAL_MS?.trim();
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_POLL_INTERVAL_MS) {
    throw new Error(`AGENT_POLL_INTERVAL_MS must be a whole number of at least ${MIN_POLL_INTERVAL_MS}, got ${raw}`);
  }
  return parsed;
}

function port(): number {
  const raw = process.env.AGENT_APPROVAL_PORT?.trim();
  if (!raw) return DEFAULT_APPROVAL_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PORT) {
    throw new Error(`AGENT_APPROVAL_PORT must be a port number between 1 and ${MAX_PORT}, got ${raw}`);
  }
  return parsed;
}

/**
 * The secret is only required by a policy that escalates something, and refusing to start without it
 * is the point: a rule asking for a confirmation nobody can give would leave those proposals waiting
 * forever, which reads like an agent that has quietly stopped working.
 */
function confirmationSecret(policy: Policy): Uint8Array | null {
  const raw = process.env.AGENT_TOTP_SECRET?.trim();
  const escalates = Object.values(policy).some(rule => rule.requireConfirmation === true);
  if (!raw) {
    if (escalates) {
      throw new Error(
        "the policy asks for a confirmation on at least one rule and AGENT_TOTP_SECRET is unset, so no code " +
          "could ever release one",
      );
    }
    return null;
  }
  try {
    return decodeBase32(raw);
  } catch (error) {
    throw new Error(`AGENT_TOTP_SECRET is not a base32 secret: ${(error as Error).message}`);
  }
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) {
    throw new Error(`policy.${field} must be an array of strings`);
  }
  if (value.length === 0) throw new Error(`policy.${field} is empty, which allows nothing: remove the rule instead`);
  return value as string[];
}

/**
 * Amounts are tinybars in a string, the way every amount in the domain is a tinybar `bigint`. JSON
 * numbers are doubles and would round an amount above 2^53 silently, which for HBAR is a real
 * balance rather than a theoretical one.
 */
function tinybars(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`policy.${field} must be a whole number of tinybars in a string, got ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`policy.${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function tokenAdminOperations(value: unknown): TokenAdminRule["operations"] {
  const names = stringList(value, "tokenAdmin.operations");
  const unknown = names.find(name => !TOKEN_ADMIN_OPERATIONS.some(allowed => allowed === name));
  if (unknown) {
    throw new Error(
      `policy.tokenAdmin.operations has ${unknown}; it must be one of ${TOKEN_ADMIN_OPERATIONS.join(", ")}`,
    );
  }
  return names as TokenAdminRule["operations"];
}

function entityId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`policy.${field} must be a 0.0.x id, got ${JSON.stringify(value)}`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`policy.${field} must be true or false`);
  return value;
}

/**
 * A key the file carries that no rule reads is a limit its author believes is in force. Refusing to
 * start is the only way that mistake surfaces before a signature does.
 */
function rejectUnknownKeys(value: Record<string, unknown>, known: string[], field: string): void {
  const unexpected = Object.keys(value).find(key => !known.includes(key));
  if (unexpected) throw new Error(`policy.${field} has no rule named ${unexpected}`);
}

export function parsePolicy(source: string): Policy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`the policy is not valid JSON: ${(error as Error).message}`);
  }
  const root = asObject(parsed, "");
  rejectUnknownKeys(root, ["upgrade", "treasurySwap", "tokenAdmin", "treasuryTransfer"], "");

  const policy: Policy = {};

  if (root.upgrade !== undefined) {
    const rule = asObject(root.upgrade, "upgrade");
    rejectUnknownKeys(
      rule,
      ["targets", "implementations", "manifestTopicId", "allowInitializer", "requireConfirmation"],
      "upgrade",
    );
    // An upgrade rule has to say how an implementation is trusted, and there are two ways: a list of
    // addresses, or a release topic whose manifests the deployed code is checked against. Neither
    // means the rule would approve any implementation at all for a listed proxy.
    if (rule.implementations === undefined && rule.manifestTopicId === undefined) {
      throw new Error("policy.upgrade needs implementations, manifestTopicId, or both: neither trusts nothing");
    }
    policy.upgrade = {
      targets: stringList(rule.targets, "upgrade.targets"),
      implementations:
        rule.implementations === undefined ? undefined : stringList(rule.implementations, "upgrade.implementations"),
      manifestTopicId:
        rule.manifestTopicId === undefined ? undefined : entityId(rule.manifestTopicId, "upgrade.manifestTopicId"),
      allowInitializer: optionalBoolean(rule.allowInitializer, "upgrade.allowInitializer"),
      requireConfirmation: optionalBoolean(rule.requireConfirmation, "upgrade.requireConfirmation"),
    };
  }

  if (root.treasurySwap !== undefined) {
    const rule = asObject(root.treasurySwap, "treasurySwap");
    rejectUnknownKeys(rule, ["maxAmountInTinybars", "tokensOut", "recipients", "requireConfirmation"], "treasurySwap");
    policy.treasurySwap = {
      maxAmountInTinybars: tinybars(rule.maxAmountInTinybars, "treasurySwap.maxAmountInTinybars"),
      tokensOut: stringList(rule.tokensOut, "treasurySwap.tokensOut"),
      recipients: stringList(rule.recipients, "treasurySwap.recipients"),
      requireConfirmation: optionalBoolean(rule.requireConfirmation, "treasurySwap.requireConfirmation"),
    };
  }

  if (root.tokenAdmin !== undefined) {
    const rule = asObject(root.tokenAdmin, "tokenAdmin");
    rejectUnknownKeys(rule, ["operations", "tokens", "requireConfirmation"], "tokenAdmin");
    policy.tokenAdmin = {
      operations: tokenAdminOperations(rule.operations),
      tokens: stringList(rule.tokens, "tokenAdmin.tokens"),
      requireConfirmation: optionalBoolean(rule.requireConfirmation, "tokenAdmin.requireConfirmation"),
    };
  }

  if (root.treasuryTransfer !== undefined) {
    const rule = asObject(root.treasuryTransfer, "treasuryTransfer");
    rejectUnknownKeys(rule, ["maxTinybars", "recipients", "tokens", "requireConfirmation"], "treasuryTransfer");
    policy.treasuryTransfer = {
      maxTinybars: tinybars(rule.maxTinybars, "treasuryTransfer.maxTinybars"),
      recipients: stringList(rule.recipients, "treasuryTransfer.recipients"),
      tokens: rule.tokens === undefined ? undefined : stringList(rule.tokens, "treasuryTransfer.tokens"),
      requireConfirmation: optionalBoolean(rule.requireConfirmation, "treasuryTransfer.requireConfirmation"),
    };
  }

  return policy;
}

export function loadConfig(): AgentConfig {
  const policyFile = requiredEnv("AGENT_POLICY_FILE");
  let source: string;
  try {
    source = readFileSync(policyFile, "utf8");
  } catch (error) {
    throw new Error(`AGENT_POLICY_FILE ${policyFile} could not be read: ${(error as Error).message}`);
  }

  const policy = parsePolicy(source);

  return {
    network: agentNetwork(),
    agentAccountId: requiredEnv("AGENT_ACCOUNT_ID"),
    // An ECDSA key is what `yarn setup` writes for the demo council members; a malformed one has to
    // fail here rather than at the first signature, when a proposal is already waiting on it.
    agentKey: PrivateKey.fromStringECDSA(requiredEnv("AGENT_PRIVATE_KEY")),
    governanceAccountId: requiredEnv("GOVERNANCE_ACCOUNT_ID"),
    executorContractId: requiredEnv("EXECUTOR_CONTRACT_ID"),
    rpcUrl: requiredEnv("HEDERA_RPC_URL"),
    pollIntervalMs: pollInterval(),
    dryRun: process.env.AGENT_DRY_RUN?.trim() === "true",
    policy,
    decisionTopicId: requiredEnv("AGENT_DECISION_TOPIC_ID"),
    confirmationSecret: confirmationSecret(policy),
    approval: { host: process.env.AGENT_APPROVAL_HOST?.trim() || DEFAULT_APPROVAL_HOST, port: port() },
  };
}
