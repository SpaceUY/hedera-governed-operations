/**
 * What a proposal of one kind would do to the node it reaches, in the map's words: "would become v2",
 * "would be paused", "would receive 40 ℏ". Each kind says it in its own module next to this one, and
 * `registry.ts` lists them, so a new kind is one module and one line.
 */
import type { CouncilKey } from "@sh/core/governance/council";
import type { ProposalKind, RegistryOperation, ScheduledOperation } from "@sh/core/governance/proposalTypes";

/** A decoded operation of kind `K`, whichever layer of a proposal it was read from. */
export type OperationOf<K extends ProposalKind> = Extract<RegistryOperation | ScheduledOperation, { kind: K }>;

/** Any operation the decoders fully understood; an unrecognized body never gets words. */
export type KnownOperation = OperationOf<ProposalKind>;

/** Which of the vault's two implementations this template deploys an address is. */
export type VaultRelease = "first" | "next";

/** What the words depend on that the operation does not say itself. */
export type PreviewContext = {
  /** The council as the ledger has it now, to tell the seats a rotation adds from the ones it removes. */
  council: CouncilKey;
  vaultReleaseOf: (implementation: string) => VaultRelease | null;
  /** A token's symbol and decimals when the app has read them; null for any other token. */
  tokenOf: (tokenId: string) => { symbol: string; decimals: number } | null;
};

/** Words for one ledger entity the operation names: a contract, a token, an account or a council key. */
export type PreviewLabel = { ref: string; text: string };

export type PreviewKind<K extends ProposalKind> = {
  labels: (operation: OperationOf<K>, context: PreviewContext) => PreviewLabel[];
};
