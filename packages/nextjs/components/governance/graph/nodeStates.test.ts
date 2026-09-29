import { MAP_NODE_STATES } from "./copy";
import { nodeStateCaptions } from "./nodeStates";
import { describe, expect, it } from "vitest";
import type { NodeStates } from "~~/services/liveMap/events/mapEvents";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

const FIRST = "0x83187fe769f2730EA3c0A9886830a74C8110F73D";
const NEXT = "0xb87228Be9d802953d9e657f97b827786b22e7305";
const RELEASES = { first: FIRST, next: NEXT };

const states = (vaultImplementation: string | null, tokenPaused: boolean | null = false): NodeStates => ({
  vaultImplementation,
  tokenPaused,
});

describe("nodeStateCaptions", () => {
  it("names the vault's version by the implementation its proxy runs, in any casing", () => {
    expect(nodeStateCaptions(states(FIRST.toLowerCase()), RELEASES)[MAP_ENTITY_IDS.vault]).toBe(
      MAP_NODE_STATES.vault.first,
    );
    expect(nodeStateCaptions(states(NEXT), RELEASES)[MAP_ENTITY_IDS.vault]).toBe(MAP_NODE_STATES.vault.next);
  });

  it("leaves the vault's caption alone when it runs code that is neither version", () => {
    expect(nodeStateCaptions(states("0x0000000000000000000000000000000000000001"), RELEASES)).not.toHaveProperty(
      MAP_ENTITY_IDS.vault,
    );
    expect(nodeStateCaptions(states(NEXT), {})).not.toHaveProperty(MAP_ENTITY_IDS.vault);
  });

  it("says whether the token is paused", () => {
    expect(nodeStateCaptions(states(NEXT, true), RELEASES)[MAP_ENTITY_IDS.token]).toBe(MAP_NODE_STATES.token.paused);
    expect(nodeStateCaptions(states(NEXT), RELEASES)[MAP_ENTITY_IDS.token]).toBe(MAP_NODE_STATES.token.active);
  });

  it("says nothing about a state that could not be read, and keeps the other", () => {
    expect(nodeStateCaptions(states(null, true), RELEASES)).toEqual({ [MAP_ENTITY_IDS.token]: "Paused" });
    expect(nodeStateCaptions(states(NEXT, null), RELEASES)).toEqual({ [MAP_ENTITY_IDS.vault]: "v2 · withdrawals on" });
    expect(nodeStateCaptions(null, RELEASES)).toEqual({});
  });
});
