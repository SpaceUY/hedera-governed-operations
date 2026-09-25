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
/** `AccessControlUnauthorizedAccount`, what registering without the role reverts with. */
const ACCESS_CONTROL_ERROR = `0xe2517d3f${"00".repeat(12)}${PROPOSER.slice(2)}${"00".repeat(32)}`;

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

/** `Panic(0x32)`, which is what reading past the end of the registry's array produces. */
const ARRAY_OUT_OF_BOUNDS = `0x4e487b71${"00".repeat(31)}32`;

/**
 * One JSON-RPC answer per relay call, in order: a number is the entry's state, an Error is a relay
 * that refused, and "revert" is the contract itself refusing.
 */
function stubRelay(...answers: (number | Error | "revert")[]) {
  const fetchMock = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) {
      fetchMock.mockResolvedValueOnce(new Response("upstream error", { status: 502 }));
      continue;
    }
    const payload =
      answer === "revert"
        ? { jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted", data: ARRAY_OUT_OF_BOUNDS } }
        : { jsonrpc: "2.0", id: 1, result: entryResponse(answer) };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
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

  /**
   * A revert leaves its error payload in `call_result`, so reading it as a number would either blow
   * up or hand back something that can never be an entry, leaving the caller polling forever.
   * Registering without `PROPOSER_ROLE` is exactly that case.
   */
  it("refuses to read an id out of a registration that reverted", () => {
    const reverted = { call_result: ACCESS_CONTROL_ERROR, error_message: ACCESS_CONTROL_ERROR } as MirrorContractResult;

    expect(() => proposalIdFromContractResult(reverted)).toThrow(/failed on chain/);
  });

  it("waits rather than guessing when the result is not a uint256 at all", () => {
    expect(proposalIdFromContractResult(contractResultWith("0xe2517d3f"))).toBeNull();
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

  /**
   * A revert is the registry answering, not the relay failing. Signing a schedule for an entry that
   * was never registered spends the council's approval on a call that reverts and charges the
   * governance account, so it cannot be shown as the same "could not check" as a relay outage.
   */
  it("reports an id the registry holds no entry for as missing, not as unreachable", async () => {
    stubRelay("revert");

    const entries = await fetchRegistryEntries([999], registry);

    expect(entries.get(999)).toMatchObject({ status: "missing", reason: expect.stringContaining("999") });
  });

  it("refuses to guess when the registry reports a state it does not know", async () => {
    stubRelay(7);

    const entries = await fetchRegistryEntries([7], registry);

    expect(entries.get(7)?.status).toBe("missing");
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
