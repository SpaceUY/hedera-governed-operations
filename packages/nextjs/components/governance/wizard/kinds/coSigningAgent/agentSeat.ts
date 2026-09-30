import { CO_SIGNING_AGENT_COPY } from "./copy";
import type { PublicKey } from "@hiero-ledger/sdk";
import { type CouncilKey, memberKeyOfAccount, memberPublicKey } from "@sh/core/governance/council";
import { singlePublicKey } from "@sh/core/governance/schedules";
import type { MirrorAccount } from "@sh/core/mirror";
import { accountLookup } from "~~/components/governance/wizard/kinds/accountLookup";
import { type DraftResult, draftCouncilRotation, tryDraft } from "~~/services/governance/drafts";

/**
 * `packages/agent` loads its key with `PrivateKey.fromStringECDSA`, and `yarn setup` seats only accounts
 * created from an ECDSA key, so an agent's account holding any other key could never sign as the agent.
 */
const AGENT_KEY_TYPE = "ECDSA_SECP256K1";

export type AgentSeat = { status: "found"; key: PublicKey } | Exclude<DraftResult, { status: "ready" }>;

type AgentAccountRead = { account: MirrorAccount | undefined; error: Error | null };

/** The council the agent would join, and the agent account the configuration names, if any. */
type SeatingContext = { council: CouncilKey; configuredAgentId: string | null };

/**
 * The key the typed account would seat, or why it cannot be the agent's seat: not an account yet, not
 * one single ECDSA key, or a member of the council already — said as such when it is the configured agent.
 */
export function agentSeatOf(
  input: string,
  read: AgentAccountRead,
  { council, configuredAgentId }: SeatingContext,
): AgentSeat {
  const lookup = accountLookup(input, { accountId: read.account?.account, error: read.error });
  if (lookup.status !== "found") return lookup;

  const accountKey = read.account?.key ?? null;
  const key = singlePublicKey(accountKey);
  const keyType = accountKey?._type ?? "missing";
  if (!key) return { status: "invalid", message: CO_SIGNING_AGENT_COPY.notSingleKey(lookup.accountId, keyType) };
  if (keyType !== AGENT_KEY_TYPE) {
    return { status: "invalid", message: CO_SIGNING_AGENT_COPY.notEcdsa(lookup.accountId, keyType) };
  }
  const seat = memberKeyOfAccount(accountKey);
  if (seat && council.memberKeys.includes(seat)) {
    const message =
      lookup.accountId === configuredAgentId
        ? CO_SIGNING_AGENT_COPY.agentSeated(lookup.accountId)
        : CO_SIGNING_AGENT_COPY.alreadyMember(lookup.accountId);
    return { status: "invalid", message };
  }
  return { status: "found", key };
}

/**
 * The rotation that seats the agent: every current member kept, in the council's order, the agent's
 * key after them, and the threshold unchanged — 2-of-3 becomes 2-of-4.
 */
export function draftAgentSeat(governanceAccountId: string, council: CouncilKey, agentKey: PublicKey): DraftResult {
  const memberKeys = [...council.memberKeys.map(memberPublicKey), agentKey];
  return tryDraft(() => draftCouncilRotation({ governanceAccountId }, { memberKeys, threshold: council.threshold }));
}
