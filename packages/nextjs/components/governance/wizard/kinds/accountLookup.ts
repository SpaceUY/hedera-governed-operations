import { MirrorNodeError, isMirrorEntityRef } from "@sh/core/mirror";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";

/**
 * The parts of a `useAccount` read a form decides on, as primitives so a form's effect can depend on
 * them without re-running on every render.
 */
export type AccountRead = { accountId: string | undefined; error: Error | null };

export type AccountLookup =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "found"; accountId: string };

/**
 * What a typed account (a `0.0.x` id or an EVM address) amounts to once the Mirror Node has been
 * asked, with the words for each way it is not an account yet. Still looking reads as empty: the form
 * shows its own loading line, and a draft is not something to offer until the account is known.
 */
export function accountLookup(input: string, read: AccountRead): AccountLookup {
  if (!input) return { status: "empty" };
  // `useAccount` stays idle on an input it cannot look up, so a malformed one would otherwise wait forever.
  if (!isMirrorEntityRef(input)) return { status: "invalid", message: ACCOUNT_LOOKUP_LABELS.malformed(input) };
  if (read.error) {
    const notFound = read.error instanceof MirrorNodeError && read.error.status === 404;
    const label = notFound ? ACCOUNT_LOOKUP_LABELS.notFound : ACCOUNT_LOOKUP_LABELS.unreachable;
    return { status: "invalid", message: label(input) };
  }
  if (!read.accountId) return { status: "empty" };
  return { status: "found", accountId: read.accountId };
}
