import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph,
  type GraphLayout,
  type GraphSnapshot,
  autoLayout,
  deriveGraphState,
  edgeId,
  memberNodeId,
  proposerNodeId,
  scopeOf,
} from "./graph";
import type { DecodedOperation } from "./proposalRoutes";
import type { RegistryOperation, ScheduledOperation } from "./proposalTypes";
import type { Proposal } from "./proposals";
import type { RegistryCrossCheck } from "./registry";
import { describe, expect, it } from "vitest";
import type { MirrorSchedule, ScheduleStatus } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

const GOVERNANCE = "0.0.4000";
/** 4000 as a long-zero address, the form a swap names the governance account as its recipient. */
const GOVERNANCE_ADDRESS = "0x0000000000000000000000000000000000000fa0";
const TOKEN = "0.0.6000";
const TOKEN_ADDRESS = "0x0000000000000000000000000000000000001770";
/** Deployed through the relay, so its address is not the long-zero form of its id. */
const VAULT_ADDRESS = "0x3f806946439c3521eeD7d740c3f84E09888C0419";
const TOKEN_ADMIN_ADDRESS = "0x5aF0000000000000000000000000000000000002";
const ADAPTER_ADDRESS = "0x5aF0000000000000000000000000000000000003";
const [ALICE, BOB, CAROL, DAVE] = ["YWxpY2U=", "Ym9i", "Y2Fyb2w=", "ZGF2ZQ=="];

const SNAPSHOT: GraphSnapshot = {
  governanceAccountId: GOVERNANCE,
  executor: { ref: "0.0.5000", evmAddress: "0x5aF0000000000000000000000000000000000000" },
  council: { threshold: 2, memberKeys: [ALICE, BOB, CAROL] },
  proposers: [{ accountId: "0.0.4100", key: null }],
  entities: [
    { id: "vault", role: "target", ref: "0.0.5001", evmAddress: VAULT_ADDRESS },
    {
      id: "tokenAdmin",
      role: "target",
      ref: "0.0.5002",
      evmAddress: TOKEN_ADMIN_ADDRESS,
      links: [{ to: "token", kind: "authority" }],
    },
    {
      id: "swapAdapter",
      role: "target",
      ref: "0.0.5003",
      evmAddress: ADAPTER_ADDRESS,
      links: [{ to: "router", kind: "authority" }],
    },
    { id: "token", role: "token", ref: TOKEN },
    { id: "router", role: "external", ref: "0.0.1414040", links: [{ to: GOVERNANCE_ACCOUNT_NODE_ID, kind: "funds" }] },
    { id: "supplier", role: "external", ref: "0.0.7000" },
  ],
  proposals: [],
};

const UPGRADE_ENTRY = {
  kind: "upgrade",
  target: VAULT_ADDRESS.toLowerCase(),
  implementation: "0x0000000000000000000000000000000000a2d434",
  initializerCalldata: "0x",
  initializer: { kind: "none" },
} as const;

const UPGRADE: DecodedOperation = UPGRADE_ENTRY;

const SWAP: DecodedOperation = {
  kind: "treasurySwap",
  target: ADAPTER_ADDRESS,
  tokenOut: TOKEN_ADDRESS,
  fee: 3000,
  recipient: GOVERNANCE_ADDRESS,
  amountInTinybars: 100n,
  amountOutMinimum: 1n,
  deadline: 0,
};

const PAUSE: DecodedOperation = {
  kind: "tokenAdmin",
  target: TOKEN_ADMIN_ADDRESS,
  operation: "pause",
  token: TOKEN_ADDRESS,
  account: null,
};

const transferTo = (...recipients: string[]): DecodedOperation => ({
  kind: "treasuryTransfer",
  hbar: [
    { accountId: GOVERNANCE, tinybars: -BigInt(recipients.length) },
    ...recipients.map(accountId => ({ accountId, tinybars: 1n })),
  ],
  tokens: [],
});

const ROTATION: DecodedOperation = {
  kind: "councilRotation",
  accountId: GOVERNANCE,
  council: { threshold: 2, memberKeys: [ALICE, BOB, DAVE] },
};

const REGISTRY_CALL: ScheduledOperation = {
  kind: "registryCall",
  executorContractId: "0.0.5000",
  proposalId: 1,
  gas: 150_000,
  payableTinybars: 0n,
};

/** A proposal whose decoded operation is `operation`, as the inbox would hand it over. */
function proposalOf(operation: DecodedOperation, status: ScheduleStatus = "pending"): Proposal {
  const isContract =
    operation.kind === "upgrade" || operation.kind === "treasurySwap" || operation.kind === "tokenAdmin";
  const registry: RegistryCrossCheck = isContract
    ? { status: "read", entry: { proposalId: 1, state: "pending", target: "0x0", calldata: "0x", operation } }
    : { status: "notApplicable" };
  return {
    schedule: executedSchedule as MirrorSchedule,
    state: { status, signatureCount: 1, executedAt: null, expiresAt: null, isSettled: status !== "pending" },
    progress: { signed: 0, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: isContract ? REGISTRY_CALL : (operation as ScheduledOperation),
    registry,
  };
}

const graphWith = (...operations: DecodedOperation[]): GovernanceGraph =>
  deriveGraphState({ ...SNAPSHOT, proposals: operations.map(operation => proposalOf(operation)) });

const edgeOf = (graph: GovernanceGraph, from: string, to: string) =>
  graph.edges.find(edge => edge.id === edgeId(from, to));

describe("deriveGraphState", () => {
  const graph = deriveGraphState(SNAPSHOT);

  it("seats every council member on the governance account", () => {
    for (const key of [ALICE, BOB, CAROL]) {
      expect(edgeOf(graph, memberNodeId(key), GOVERNANCE_ACCOUNT_NODE_ID)?.kind).toBe("authority");
    }
  });

  it("follows the trust chain: governance account to executor to every target", () => {
    expect(edgeOf(graph, GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID)?.kind).toBe("authority");
    for (const target of ["vault", "tokenAdmin", "swapAdapter"]) {
      expect(edgeOf(graph, EXECUTOR_NODE_ID, target)?.kind).toBe("authority");
    }
    expect(edgeOf(graph, EXECUTOR_NODE_ID, "token")).toBeUndefined();
  });

  it("gives a proposer an edge to the executor that bypasses the governance account", () => {
    const proposer = proposerNodeId("0.0.4100");
    expect(graph.nodes.find(node => node.id === proposer)?.role).toBe("proposer");
    expect(edgeOf(graph, proposer, EXECUTOR_NODE_ID)?.kind).toBe("authority");
    expect(edgeOf(graph, proposer, GOVERNANCE_ACCOUNT_NODE_ID)).toBeUndefined();
  });

  it("reuses the node of a proposer the configuration already knows", () => {
    const withSupplierProposing = deriveGraphState({
      ...SNAPSHOT,
      proposers: [{ accountId: "0.0.7000", key: null }],
    });
    expect(withSupplierProposing.nodes.some(node => node.role === "proposer")).toBe(false);
    expect(edgeOf(withSupplierProposing, "supplier", EXECUTOR_NODE_ID)?.kind).toBe("authority");
  });

  it("a seated proposer keeps one node", () => {
    const seated = deriveGraphState({ ...SNAPSHOT, proposers: [{ accountId: "0.0.4101", key: ALICE }] });
    expect(seated.nodes.filter(node => node.role === "proposer")).toEqual([]);
    expect(seated.nodes.filter(node => node.id === memberNodeId(ALICE))).toHaveLength(1);
    expect(edgeOf(seated, memberNodeId(ALICE), EXECUTOR_NODE_ID)?.kind).toBe("authority");
    expect(edgeOf(seated, memberNodeId(ALICE), GOVERNANCE_ACCOUNT_NODE_ID)?.kind).toBe("authority");
  });

  it("a threshold-key proposer stays a proposer node", () => {
    const multisig = deriveGraphState({ ...SNAPSHOT, proposers: [{ accountId: "0.0.4102", key: null }] });
    expect(multisig.nodes.find(node => node.id === proposerNodeId("0.0.4102"))?.role).toBe("proposer");
    expect(edgeOf(multisig, proposerNodeId("0.0.4102"), EXECUTOR_NODE_ID)?.kind).toBe("authority");
  });

  it("a proposer whose key holds no seat stays a proposer node", () => {
    const outsider = deriveGraphState({ ...SNAPSHOT, proposers: [{ accountId: "0.0.4103", key: DAVE }] });
    expect(outsider.nodes.find(node => node.id === proposerNodeId("0.0.4103"))?.role).toBe("proposer");
    expect(outsider.nodes.some(node => node.id === memberNodeId(DAVE))).toBe(false);
  });

  it("draws the links entities declare with their kind", () => {
    expect(edgeOf(graph, "tokenAdmin", "token")?.kind).toBe("authority");
    expect(edgeOf(graph, "router", GOVERNANCE_ACCOUNT_NODE_ID)?.kind).toBe("funds");
  });

  it("has no intent at rest, and one edge per id", () => {
    expect(graph.edges.filter(edge => edge.kind === "intent")).toEqual([]);
    expect(new Set(graph.edges.map(edge => edge.id)).size).toBe(graph.edges.length);
  });

  it("adds a pending transfer's recipient the configuration does not know, once", () => {
    const withTransfers = graphWith(transferTo("0.0.9999"), transferTo("0.0.9999"));
    const recipient = withTransfers.nodes.find(node => node.ref === "0.0.9999");
    expect(recipient?.role).toBe("external");
    expect(withTransfers.edges.filter(edge => edge.to === recipient?.id)).toEqual([
      {
        id: edgeId(GOVERNANCE_ACCOUNT_NODE_ID, recipient!.id),
        kind: "intent",
        from: GOVERNANCE_ACCOUNT_NODE_ID,
        to: recipient!.id,
      },
    ]);
  });

  it("adds an incoming council member with a seat it does not hold yet", () => {
    const withRotation = graphWith(ROTATION);
    expect(withRotation.nodes.find(node => node.id === memberNodeId(DAVE))?.role).toBe("member");
    expect(edgeOf(withRotation, memberNodeId(DAVE), GOVERNANCE_ACCOUNT_NODE_ID)?.kind).toBe("intent");
    expect(edgeOf(withRotation, memberNodeId(CAROL), GOVERNANCE_ACCOUNT_NODE_ID)?.kind).toBe("authority");
  });

  it("ignores settled proposals", () => {
    const settled = deriveGraphState({ ...SNAPSHOT, proposals: [proposalOf(transferTo("0.0.9999"), "executed")] });
    expect(settled).toEqual(deriveGraphState(SNAPSHOT));
  });

  it("ignores a pending schedule whose registry entry no longer runs", () => {
    const elsewhere: RegistryOperation = { ...UPGRADE_ENTRY, target: "0x00000000000000000000000000000000000000ab" };
    const cancelled: Proposal = {
      ...proposalOf(elsewhere),
      registry: {
        status: "read",
        entry: { proposalId: 1, state: "cancelled", target: "0x0", calldata: "0x", operation: elsewhere },
      },
    };
    expect(graphWith(elsewhere)).not.toEqual(deriveGraphState(SNAPSHOT));
    expect(deriveGraphState({ ...SNAPSHOT, proposals: [cancelled] })).toEqual(deriveGraphState(SNAPSHOT));
  });

  it("adds nothing for an operation it cannot route", () => {
    const foreignTransfer: DecodedOperation = {
      kind: "treasuryTransfer",
      hbar: [
        { accountId: "0.0.8888", tinybars: -1n },
        { accountId: "0.0.9999", tinybars: 1n },
      ],
      tokens: [],
    };
    expect(graphWith(foreignTransfer)).toEqual(deriveGraphState(SNAPSHOT));
  });

  it("places and names nodes from the layout, and everything else automatically", () => {
    const layout: GraphLayout = {
      width: 800,
      height: 400,
      positions: { vault: { x: 10, y: 20 } },
      labels: { vault: "Vault" },
    };
    const laidOut = deriveGraphState(SNAPSHOT, layout);
    const vault = laidOut.nodes.find(node => node.id === "vault");
    const token = laidOut.nodes.find(node => node.id === "token");

    expect(laidOut).toMatchObject({ width: 800, height: 400 });
    expect(vault).toMatchObject({ label: "Vault", position: { x: 10, y: 20 }, evmAddress: VAULT_ADDRESS });
    expect(token).toMatchObject({ label: TOKEN, position: autoLayout(laidOut.nodes, layout)[token!.id] });
  });
});

describe("autoLayout", () => {
  it("puts members, the governance account, the executor, targets and what they reach in columns", () => {
    const graph = deriveGraphState(SNAPSHOT);
    const x = (id: string) => graph.nodes.find(node => node.id === id)!.position.x;

    expect(x(memberNodeId(ALICE))).toBeLessThan(x(GOVERNANCE_ACCOUNT_NODE_ID));
    expect(x(GOVERNANCE_ACCOUNT_NODE_ID)).toBeLessThan(x(EXECUTOR_NODE_ID));
    expect(x(EXECUTOR_NODE_ID)).toBeLessThan(x("vault"));
    expect(x("vault")).toBeLessThan(x("token"));
  });

  it("spreads a column evenly inside the canvas", () => {
    const positions = autoLayout(
      [
        { id: "a", role: "member" },
        { id: "b", role: "member" },
      ],
      { width: 500, height: 200 },
    );
    expect(positions).toEqual({ a: { x: 50, y: 50 }, b: { x: 50, y: 150 } });
  });
});

describe("scopeOf", () => {
  it("routes an upgrade through the executor to the vault named by its relay address", () => {
    expect(scopeOf(graphWith(UPGRADE), UPGRADE)).toEqual({
      nodeIds: [GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID, "vault"],
      edgeIds: [edgeId(GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID), edgeId(EXECUTOR_NODE_ID, "vault")],
    });
  });

  it("brings a swap's proceeds from the router back to the governance account", () => {
    expect(scopeOf(graphWith(SWAP), SWAP)).toEqual({
      nodeIds: [GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID, "swapAdapter", "router"],
      edgeIds: [
        edgeId(GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID),
        edgeId(EXECUTOR_NODE_ID, "swapAdapter"),
        edgeId("swapAdapter", "router"),
        edgeId("router", GOVERNANCE_ACCOUNT_NODE_ID),
      ],
    });
  });

  it("draws a swap's return as intent when the configuration declares no funds edge for it", () => {
    const entities = SNAPSHOT.entities.map(entity => (entity.id === "router" ? { ...entity, links: [] } : entity));
    const graph = deriveGraphState({ ...SNAPSHOT, entities, proposals: [proposalOf(SWAP)] });
    expect(edgeOf(graph, "router", GOVERNANCE_ACCOUNT_NODE_ID)?.kind).toBe("intent");
    expect(scopeOf(graph, SWAP)?.edgeIds.at(-1)).toBe(edgeId("router", GOVERNANCE_ACCOUNT_NODE_ID));
  });

  it("has no scope for a swap whose adapter calls nothing the graph knows", () => {
    const entities = SNAPSHOT.entities.map(entity => (entity.id === "swapAdapter" ? { ...entity, links: [] } : entity));
    const graph = deriveGraphState({ ...SNAPSHOT, entities, proposals: [proposalOf(SWAP)] });
    expect(scopeOf(graph, SWAP)).toBeNull();
  });

  it("has no scope for a swap whose adapter has authority over more than one node", () => {
    const entities = SNAPSHOT.entities.map(entity =>
      entity.id === "swapAdapter"
        ? {
            ...entity,
            links: [
              { to: "router", kind: "authority" as const },
              { to: "token", kind: "authority" as const },
            ],
          }
        : entity,
    );
    const graph = deriveGraphState({ ...SNAPSHOT, entities, proposals: [proposalOf(SWAP)] });
    expect(scopeOf(graph, SWAP)).toBeNull();
  });

  it("routes a token-admin operation to the token named by its long-zero address", () => {
    expect(scopeOf(graphWith(PAUSE), PAUSE)?.nodeIds).toEqual([
      GOVERNANCE_ACCOUNT_NODE_ID,
      EXECUTOR_NODE_ID,
      "tokenAdmin",
      "token",
    ]);
  });

  it("sends a transfer straight to its recipient, never through the executor", () => {
    const transfer = transferTo("0.0.7000");
    const graph = graphWith(transfer);
    expect(edgeOf(graph, GOVERNANCE_ACCOUNT_NODE_ID, "supplier")?.kind).toBe("intent");
    expect(scopeOf(graph, transfer)).toEqual({
      nodeIds: [GOVERNANCE_ACCOUNT_NODE_ID, "supplier"],
      edgeIds: [edgeId(GOVERNANCE_ACCOUNT_NODE_ID, "supplier")],
    });
  });

  it("covers every seat a rotation keeps, loses or adds, and never the executor", () => {
    const scope = scopeOf(graphWith(ROTATION), ROTATION);
    expect(scope?.edgeIds).toEqual(
      [ALICE, BOB, CAROL, DAVE].map(key => edgeId(memberNodeId(key), GOVERNANCE_ACCOUNT_NODE_ID)),
    );
    expect(scope?.nodeIds).not.toContain(EXECUTOR_NODE_ID);
  });

  it("has no scope for a rotation of some other account", () => {
    const elsewhere: DecodedOperation = { ...ROTATION, accountId: "0.0.8888" } as DecodedOperation;
    expect(scopeOf(graphWith(elsewhere), elsewhere)).toBeNull();
  });

  it("has no scope for an unrecognized operation", () => {
    expect(scopeOf(deriveGraphState(SNAPSHOT), { kind: "unrecognized", reason: "a blob" })).toBeNull();
  });

  it("adds nothing for a registry call whose entry could not be read", () => {
    const unread = { ...proposalOf(UPGRADE), registry: { status: "unreachable", reason: "relay" } as const };
    const graph = deriveGraphState({ ...SNAPSHOT, proposals: [unread] });
    expect(graph).toEqual(deriveGraphState(SNAPSHOT));
  });

  it("has no scope when the graph was derived without the proposal that names a new recipient", () => {
    expect(scopeOf(deriveGraphState(SNAPSHOT), transferTo("0.0.9999"))).toBeNull();
  });
});
