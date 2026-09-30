// @vitest-environment node
import { EXECUTOR_ROLE, PROPOSER_ROLE, fetchRegistryRoles } from "./roles";
import { type Address, type Hex, decodeFunctionData, encodeFunctionResult, getAddress, parseAbi } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

const ABI = parseAbi([
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
  "function getRoleMember(bytes32 role, uint256 index) view returns (address)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
]);
const ADMIN_ROLE: Hex = `0x${"00".repeat(32)}`;
const EXECUTOR = "0.0.10671156";
const REGISTRY: Address = getAddress("0x0000000000000000000000000000000000a2d434");
const TREASURY: Address = getAddress("0x0000000000000000000000000000000000a2d3ff");

/** A relay that answers each role read from `holders` and `admins`, whatever order the reads arrive in. */
function stubRelay(holders: Record<Hex, Address[]>, admins: Record<Hex, Hex>) {
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const { params } = JSON.parse(init.body);
    const call = decodeFunctionData({ abi: ABI, data: params[0].data });
    const result =
      call.functionName === "getRoleMemberCount"
        ? encodeFunctionResult({
            abi: ABI,
            functionName: call.functionName,
            result: BigInt(holders[call.args[0]]?.length ?? 0),
          })
        : call.functionName === "getRoleMember"
          ? encodeFunctionResult({
              abi: ABI,
              functionName: call.functionName,
              result: holders[call.args[0]][Number(call.args[1])],
            })
          : encodeFunctionResult({ abi: ABI, functionName: call.functionName, result: admins[call.args[0]] });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchRegistryRoles", () => {
  it("reads who holds EXECUTOR_ROLE and who holds the role administering each role", async () => {
    stubRelay(
      { [EXECUTOR_ROLE]: [TREASURY], [ADMIN_ROLE]: [REGISTRY] },
      { [PROPOSER_ROLE]: ADMIN_ROLE, [EXECUTOR_ROLE]: ADMIN_ROLE },
    );
    await expect(fetchRegistryRoles({ executorContractId: EXECUTOR, rpcUrl: "https://relay.test" })).resolves.toEqual({
      executors: [TREASURY],
      proposerAdmins: [REGISTRY],
      executorAdmins: [REGISTRY],
    });
  });

  it("asks the executor's long-zero address", async () => {
    const fetchMock = stubRelay(
      { [EXECUTOR_ROLE]: [], [ADMIN_ROLE]: [] },
      { [PROPOSER_ROLE]: ADMIN_ROLE, [EXECUTOR_ROLE]: ADMIN_ROLE },
    );
    await fetchRegistryRoles({ executorContractId: EXECUTOR, rpcUrl: "https://relay.test" });
    const to = JSON.parse(fetchMock.mock.calls[0][1].body).params[0].to as string;
    expect(to.toLowerCase()).toBe("0x0000000000000000000000000000000000a2d434");
  });

  it("fails when the relay cannot be read, so the screen can say so", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })));
    await expect(fetchRegistryRoles({ executorContractId: EXECUTOR, rpcUrl: "https://relay.test" })).rejects.toThrow();
  });
});
