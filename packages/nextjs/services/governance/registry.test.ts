// @vitest-environment node
import {
  CANCEL_PROPOSAL_GAS,
  REGISTRY_ABI,
  buildCancelProposalCall,
  fetchRegistryEntries,
  proposalIdFromContractResult,
} from "./registry";
import { encodeFunctionData, encodeFunctionResult, parseAbi, toHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MirrorContractResult } from "~~/services/mirror";

const EXECUTOR = "0.0.10671156";
const RPC_URL = "https://relay.test/api";
const VAULT_PROXY = "0x3f806946439c3521eeD7d740c3f84E09888C0419";
const VAULT_V2 = "0xF3111f1480f088c19CB80096f698E5f1B42Cb9A6";
const PROPOSER = "0xf2b17e6774b48f1073a94b78791aaa02698d1620";

const registry = { executorContractId: EXECUTOR, rpcUrl: RPC_URL };

const upgradeCalldata = encodeFunctionData({
  abi: parseAbi(["function upgradeToAndCall(address newImplementation, bytes data)"]),
  functionName: "upgradeToAndCall",
  args: [VAULT_V2, "0x"],
});

const contractResultWith = (callResult: string) => ({ call_result: callResult }) as MirrorContractResult;

const entryResponse = (state: number) =>
  encodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: "proposal",
    result: { target: VAULT_PROXY, proposer: PROPOSER, state, data: upgradeCalldata },
  });

/** One JSON-RPC answer per relay call, in order; an Error stands for a relay that refused. */
function stubRelay(...answers: (number | Error)[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) {
      fetchMock.mockResolvedValueOnce(new Response("upstream error", { status: 502 }));
      continue;
    }
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: entryResponse(answer) })),
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proposalIdFromContractResult", () => {
  it("reads the id createProposal returned, which no signer hands back", () => {
    expect(proposalIdFromContractResult(contractResultWith(toHex(7n, { size: 32 })))).toBe(7);
  });

  it("waits rather than guessing while Mirror has not recorded the result yet", () => {
    expect(proposalIdFromContractResult(contractResultWith("0x"))).toBeNull();
  });

  it("reads the first entry of a registry as zero, not as nothing", () => {
    expect(proposalIdFromContractResult(contractResultWith(toHex(0n, { size: 32 })))).toBe(0);
  });
});

describe("buildCancelProposalCall", () => {
  it("runs at the limit measured for retiring an entry", () => {
    expect(buildCancelProposalCall(EXECUTOR, 7).gas?.toNumber()).toBe(CANCEL_PROPOSAL_GAS);
  });

  it("calls the registry, since a schedule delete only ends one round of approval", () => {
    expect(buildCancelProposalCall(EXECUTOR, 7).contractId?.toString()).toBe(EXECUTOR);
  });
});

describe("fetchRegistryEntries", () => {
  it("reports an entry the proposer already cancelled, which its schedule cannot know", async () => {
    stubRelay(2);

    const entries = await fetchRegistryEntries([7], registry);

    expect(entries.get(7)).toMatchObject({ status: "read", entry: { state: "cancelled" } });
  });

  it("says what a live entry actually does", async () => {
    stubRelay(0);

    const entries = await fetchRegistryEntries([7], registry);

    expect(entries.get(7)).toMatchObject({
      status: "read",
      entry: { state: "pending", operation: { kind: "upgrade", implementation: VAULT_V2 } },
    });
  });

  it("keeps the stored calldata beside the decoded operation", async () => {
    stubRelay(0);

    const entries = await fetchRegistryEntries([7], registry);

    expect(entries.get(7)).toMatchObject({ entry: { calldata: upgradeCalldata } });
  });

  it("leaves a proposal uncrossed rather than failing when the relay refuses", async () => {
    stubRelay(new Error("relay is down"));

    const entries = await fetchRegistryEntries([7], registry);

    expect(entries.get(7)?.status).toBe("unreachable");
  });

  it("crosses the entries it could read even when another one failed", async () => {
    stubRelay(0, new Error("relay is down"));

    const entries = await fetchRegistryEntries([7, 8], registry);

    expect(entries.get(7)?.status).toBe("read");
  });

  it("asks once for an id that was listed twice", async () => {
    const fetchMock = stubRelay(0);

    await fetchRegistryEntries([7, 7], registry);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not go near the relay when nothing has to be crossed", async () => {
    const fetchMock = stubRelay();

    await fetchRegistryEntries([], registry);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
