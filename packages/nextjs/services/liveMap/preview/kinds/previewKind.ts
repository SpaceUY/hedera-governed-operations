/**
 * What a proposal of one kind would do to the node it reaches, in the map's words: "would become v2",
 * "would be paused", "would receive 40 ℏ" — and, while the wizard has the kind picked but no operation
 * yet, which way it would go (`sketch`). Each kind says it in its own module next to this one, and
 * `registry.ts` lists them, so a new kind is one module and one line.
 */
import type { CouncilKey } from "@sh/core/governance/council";
import type { ProposalKind, RegistryOperation, ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { GraphEntity } from "~~/services/liveMap/model/graph";
import type { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";
import type { OperationSketch, RouteRefs, RouteRole } from "~~/services/liveMap/model/proposalRoutes";
import type { VaultRelease } from "~~/services/liveMap/model/vaultRelease";

/** A decoded operation of kind `K`, whichever layer of a proposal it was read from. */
export type OperationOf<K extends ProposalKind> = Extract<RegistryOperation | ScheduledOperation, { kind: K }>;

/** Any operation the decoders fully understood; an unrecognized body never gets words. */
export type KnownOperation = OperationOf<ProposalKind>;

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

/** What a kind picked before its form is filled can name: the treasury, the configured entities, the co-signing agent's key. */
export type SketchContext = {
  governanceAccountId: string;
  entities: readonly GraphEntity[];
  /** The key the wizard's council rotation would seat, once the app has read it; null otherwise. */
  agentSeat: string | null;
};

/** Words for whoever fills a role of the route, for a kind whose form has not named the entity yet. */
export type RoleWords = Array<{ role: RouteRole; text: string }>;

/** A picked kind's route through what the configuration names, and the words it can say without an amount. */
export type KindSketch = { refs: RouteRefs; words: RoleWords };

/** A sketched kind as the map previews it: the graph routes it, the frame puts its words on the roles. */
export type PreviewSketch = OperationSketch & { words: RoleWords };

export type PreviewKind<K extends ProposalKind> = {
  labels: (operation: OperationOf<K>, context: PreviewContext) => PreviewLabel[];
  sketch: (context: SketchContext) => KindSketch;
};

/** The configured entity's ref as a route names it: one ref, or none when this deployment lacks the entity. */
export function configuredRefs(
  { entities }: Pick<SketchContext, "entities">,
  id: (typeof MAP_ENTITY_IDS)[keyof typeof MAP_ENTITY_IDS],
): string[] {
  return entities.filter(entity => entity.id === id).map(entity => entity.ref);
}
