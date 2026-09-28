import { EXECUTOR_NODE_ID, GOVERNANCE_ACCOUNT_NODE_ID, deriveGraphState, edgeId } from "./graph";
import { MAP_ENTITY_IDS, governanceEntities, governanceEntitiesOf } from "./graphEntities";
import { describe, expect, it, vi } from "vitest";

vi.mock("~~/utils/scaffold-hbar/contract", () => ({
  contracts: {
    296: {
      TokenAdmin: { address: "0x5aF0000000000000000000000000000000000002", abi: [], hederaContractId: "0.0.5002" },
      // Deployed through the relay with no native id resolved: named by its address.
      SaucerSwapAdapter: { address: "0x5aF0000000000000000000000000000000000003", abi: [] },
    },
  },
}));

const VAULT = { address: "0x3f806946439c3521eeD7d740c3f84E09888C0419", hederaContractId: "0.0.5001" };
const CONFIG = { network: "testnet", vault: VAULT, demoTokenId: "0.0.6000" } as const;

describe("governanceEntitiesOf", () => {
  const entities = governanceEntitiesOf(CONFIG, 296);
  const byId = (id: string) => entities.find(entity => entity.id === id);

  it("names a contract by its native id and keeps its address", () => {
    expect(byId(MAP_ENTITY_IDS.tokenAdmin)).toMatchObject({ role: "target", ref: "0.0.5002" });
    expect(byId(MAP_ENTITY_IDS.vault)).toMatchObject({ ref: "0.0.5001", evmAddress: VAULT.address });
  });

  it("names a contract with no native id by its EVM address instead of leaving it off", () => {
    expect(byId(MAP_ENTITY_IDS.swapAdapter)?.ref).toBe("0x5aF0000000000000000000000000000000000003");
  });

  it("takes the router from the swap configuration of the network, as an external entity", () => {
    expect(byId(MAP_ENTITY_IDS.router)).toMatchObject({ role: "external", ref: "0.0.1414040" });
  });

  it("gives the swap adapter exactly one authority link, to the router", () => {
    const links = byId(MAP_ENTITY_IDS.swapAdapter)?.links ?? [];
    expect(links.filter(link => link.kind === "authority")).toEqual([{ to: MAP_ENTITY_IDS.router, kind: "authority" }]);
  });

  it("draws where the money is: the router back to the treasury, and the vault's reserve", () => {
    const graph = deriveGraphState({
      governanceAccountId: "0.0.4000",
      executor: { ref: "0.0.5000" },
      council: { threshold: 1, memberKeys: ["YQ=="] },
      proposers: [],
      entities,
      proposals: [],
    });
    const kindOf = (from: string, to: string) => graph.edges.find(edge => edge.id === edgeId(from, to))?.kind;

    expect(kindOf(MAP_ENTITY_IDS.router, GOVERNANCE_ACCOUNT_NODE_ID)).toBe("funds");
    expect(kindOf(MAP_ENTITY_IDS.vault, GOVERNANCE_ACCOUNT_NODE_ID)).toBe("funds");
    expect(kindOf(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.swapAdapter)).toBe("authority");
    expect(kindOf(MAP_ENTITY_IDS.tokenAdmin, MAP_ENTITY_IDS.token)).toBe("authority");
  });
});

describe("governanceEntities", () => {
  it("leaves out a contract that is not deployed, and its link", () => {
    const entities = governanceEntities({
      vault: VAULT,
      tokenAdmin: null,
      swapAdapter: null,
      tokenId: "0.0.6000",
      routerId: "0.0.1414040",
    });
    expect(entities.map(entity => entity.id)).toEqual([
      MAP_ENTITY_IDS.vault,
      MAP_ENTITY_IDS.token,
      MAP_ENTITY_IDS.router,
    ]);
  });
});
