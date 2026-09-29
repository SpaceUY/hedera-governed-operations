import { MAP_NODE_STATES } from "./copy";
import type { NodeStates } from "~~/services/liveMap/events/mapEvents";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

/** The addresses of the vault's two implementations on this deployment, when it recorded them. */
export type VaultReleases = { first?: string; next?: string };

const sameAddress = (left: string, right: string | undefined): boolean =>
  right !== undefined && left.toLowerCase() === right.toLowerCase();

function vaultCaption(implementation: string | null, releases: VaultReleases): string | undefined {
  if (implementation === null) return undefined;
  if (sameAddress(implementation, releases.first)) return MAP_NODE_STATES.vault.first;
  if (sameAddress(implementation, releases.next)) return MAP_NODE_STATES.vault.next;
  return undefined;
}

/**
 * The lines under the vault and the token that say what state they are in: which of its two versions
 * the vault runs, and whether the token is paused. They change when the map shows an operation land,
 * and stay once its lines relax. A state that could not be read, or a vault running code that is
 * neither version, leaves the node's caption: the map does not guess what it cannot name.
 */
export function nodeStateCaptions(states: NodeStates | null, releases: VaultReleases): Partial<Record<string, string>> {
  const captions: Partial<Record<string, string>> = {};
  if (!states) return captions;
  const vault = vaultCaption(states.vaultImplementation, releases);
  if (vault) captions[MAP_ENTITY_IDS.vault] = vault;
  if (states.tokenPaused !== null) {
    captions[MAP_ENTITY_IDS.token] = states.tokenPaused ? MAP_NODE_STATES.token.paused : MAP_NODE_STATES.token.active;
  }
  return captions;
}
