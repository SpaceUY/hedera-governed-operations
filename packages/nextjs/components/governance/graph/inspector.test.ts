import { type InspectorContext, inspectorContentOf } from "./inspector";
import { KEY_A, MAP_SNAPSHOT, MAP_SNAPSHOT_WITH_OPERATOR, pendingTransferTo } from "./mapFixtures";
import { type InspectorCopy, composeMap } from "./mapModel";
import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "~~/services/liveMap/model/graph";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  edgeId,
  externalNodeId,
  memberNodeId,
  proposerNodeId,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

const EXPLORER = "https://hashscan.io/testnet";
const NO_COPY: InspectorCopy = { nodes: {}, edges: {} };

function contextOf(
  snapshot: GraphSnapshot = MAP_SNAPSHOT,
  overrides: Partial<InspectorContext> = {},
): InspectorContext {
  const { graph, ghosts } = composeMap(snapshot);
  return {
    graph,
    ghosts,
    council: snapshot.council,
    proposers: snapshot.proposers,
    copy: NO_COPY,
    explorerUrl: EXPLORER,
    ...overrides,
  };
}

const node = (id: string, context = contextOf()) => inspectorContentOf({ kind: "node", id }, context);
const edge = (from: string, to: string, context = contextOf()) =>
  inspectorContentOf({ kind: "edge", id: edgeId(from, to) }, context);

describe("inspectorContentOf — nodes", () => {
  it("names the treasury's council rule as the ledger has it now", () => {
    const content = node(GOVERNANCE_ACCOUNT_NODE_ID);
    expect(content?.kicker).toBe("Account");
    expect(content?.title).toBe("Treasury");
    // Non-breaking hyphens: the rule never wraps inside the card.
    expect(content?.body).toContain("the keys of a 2\u2011of\u20113 council");
    expect(content?.rows).toEqual([{ term: "Id", value: "0.0.4000", href: `${EXPLORER}/account/0.0.4000` }]);

    const rotated = contextOf({ ...MAP_SNAPSHOT, council: { ...MAP_SNAPSHOT.council, threshold: 3 } });
    expect(node(GOVERNANCE_ACCOUNT_NODE_ID, rotated)?.body).toContain("a 3\u2011of\u20113 council");
  });

  it.each([
    [EXECUTOR_NODE_ID, "Contract · GovernedExecutor", "contract/0.0.5000"],
    [MAP_ENTITY_IDS.vault, "Contract · AcmeVault", "contract/0.0.5001"],
    [MAP_ENTITY_IDS.tokenAdmin, "Contract · TokenAdmin", "contract/0.0.5002"],
    [MAP_ENTITY_IDS.token, "Token", "token/0.0.6000"],
    [MAP_ENTITY_IDS.router, "External contract", "contract/0.0.1414040"],
  ])("gives %s the kicker %s and its HashScan page", (id, kicker, page) => {
    const content = node(id);
    expect(content?.kicker).toBe(kicker);
    expect(content?.rows[0]?.href).toBe(`${EXPLORER}/${page}`);
  });

  it("links a contract the deploy named only by its EVM address by that address", () => {
    const content = node(MAP_ENTITY_IDS.swapAdapter);
    expect(content?.kicker).toBe("Contract · SaucerSwapAdapter");
    expect(content?.rows[0]).toEqual({
      term: "Id",
      value: "0x5aF0000000000000000000000000000000000003",
      href: `${EXPLORER}/contract/0x5aF0000000000000000000000000000000000003`,
    });
  });

  it("shows a seat by the account that holds its key, with the key itself unlinked", () => {
    const content = node(memberNodeId(KEY_A));
    expect(content?.kicker).toBe("Account · may also propose");
    expect(content?.body).toContain("inside the treasury account's ThresholdKey");
    expect(content?.body).toContain("PROPOSER_ROLE");
    expect(content?.rows).toEqual([
      { term: "Account", value: "0.0.4101", href: `${EXPLORER}/account/0.0.4101` },
      { term: "Key", value: KEY_A },
    ]);
  });

  it("shows a seat no proposer holds by its key alone, and says nothing about proposing", () => {
    const context = contextOf({ ...MAP_SNAPSHOT, proposers: MAP_SNAPSHOT.proposers.slice(1) });
    const content = node(memberNodeId(KEY_A), context);
    expect(content?.kicker).toBe("Account");
    expect(content?.body).not.toContain("PROPOSER_ROLE");
    expect(content?.rows).toEqual([{ term: "Key", value: KEY_A }]);
  });

  it("tells a proposer without a seat that it cannot approve", () => {
    const content = node(proposerNodeId("0.0.4001"), contextOf(MAP_SNAPSHOT_WITH_OPERATOR));
    expect(content?.body).toContain("cannot approve");
    expect(content?.rows[0]?.href).toBe(`${EXPLORER}/account/0.0.4001`);
  });

  it("describes an account a pending transfer introduced as one it would pay", () => {
    const context = contextOf({ ...MAP_SNAPSHOT, proposals: [pendingTransferTo("0.0.7000")] });
    const content = node(externalNodeId("0.0.7000"), context);
    expect(content?.kicker).toBe("Account");
    expect(content?.body).toContain("would pay");
    expect(content?.rows[0]?.href).toBe(`${EXPLORER}/account/0.0.7000`);
  });

  it("prefers the layout's own words for a node over its role's", () => {
    const copy = { nodes: { [MAP_ENTITY_IDS.vault]: "The demo's vault." }, edges: {} };
    expect(node(MAP_ENTITY_IDS.vault, contextOf(MAP_SNAPSHOT, { copy }))?.body).toBe("The demo's vault.");
  });

  it("still says a seat may also propose when a layout words the seat itself, from the ledger's proposers", () => {
    const copy = { nodes: { [memberNodeId(KEY_A)]: "A demo co-signer." }, edges: {} };
    const content = node(memberNodeId(KEY_A), contextOf(MAP_SNAPSHOT, { copy }));
    expect(content?.body).toBe("A demo co-signer.");
    expect(content?.kicker).toBe("Account · may also propose");
  });

  it("gives a ghost its name and the neutral line, and no ids", () => {
    const ghost = { id: "ghost", label: "Co-signing agent", caption: "not a member yet", position: { x: 0, y: 0 } };
    const content = node("ghost", contextOf(MAP_SNAPSHOT, { ghosts: [ghost] }));
    expect(content).toEqual({
      kicker: "Account",
      title: "Co-signing agent",
      body: "Not on the ledger yet, so no line connects it.",
      rows: [],
    });
  });

  it("leaves the ids unlinked without a block explorer, and shows nothing for an item that is gone", () => {
    expect(node(EXECUTOR_NODE_ID, contextOf(MAP_SNAPSHOT, { explorerUrl: undefined }))?.rows).toEqual([
      { term: "Id", value: "0.0.5000", href: undefined },
    ]);
    expect(node("nowhere")).toBeNull();
    expect(inspectorContentOf({ kind: "edge", id: "nowhere->nothing" }, contextOf())).toBeNull();
  });
});

describe("inspectorContentOf — edges", () => {
  it("titles an authority edge by its ends and links both", () => {
    const content = edge(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.vault);
    expect(content).toEqual({
      kicker: "Who may act",
      title: "Proposal registry → Vault",
      body: "This contract accepts calls only from the registry.",
      rows: [
        { term: "From", value: "0.0.5000", href: `${EXPLORER}/contract/0.0.5000` },
        { term: "To", value: "0.0.5001", href: `${EXPLORER}/contract/0.0.5001` },
      ],
    });
  });

  it("files a value edge under where the money is", () => {
    const content = edge(MAP_ENTITY_IDS.router, GOVERNANCE_ACCOUNT_NODE_ID);
    expect(content?.kicker).toBe("Where the money is");
    expect(content?.title).toBe("Swap router → Treasury");
    expect(content?.body).toContain("settles straight back to the treasury");
  });

  it("names a seat's end by its account", () => {
    const content = edge(memberNodeId(KEY_A), GOVERNANCE_ACCOUNT_NODE_ID);
    expect(content?.title).toBe("0.0.4101 → Treasury");
    expect(content?.rows[0]).toEqual({ term: "From", value: "0.0.4101", href: `${EXPLORER}/account/0.0.4101` });
  });

  it("prefers the layout's own words for an edge", () => {
    const id = edgeId(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.vault);
    const copy = { nodes: {}, edges: { [id]: "The vault accepts upgrades only from the registry." } };
    expect(inspectorContentOf({ kind: "edge", id }, contextOf(MAP_SNAPSHOT, { copy }))?.body).toBe(
      "The vault accepts upgrades only from the registry.",
    );
  });

  it("files the path a pending proposal would take under would happen", () => {
    const context = contextOf({ ...MAP_SNAPSHOT, proposals: [pendingTransferTo("0.0.7000")] });
    const content = edge(GOVERNANCE_ACCOUNT_NODE_ID, externalNodeId("0.0.7000"), context);
    expect(content?.kicker).toBe("Would happen");
    expect(content?.body).toContain("a pending proposal would use it");
  });
});
