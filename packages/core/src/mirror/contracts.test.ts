import contract from "./__fixtures__/contract.json";
import { fetchContract } from "./contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const CONTRACT_ID = "0.0.10671159";
const EVM_ADDRESS = "0x618023e309e32a8e70f59fb1228c4ee5c2a867b4";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchContract", () => {
  it("requests /api/v1/contracts/{id} for a 0.0.x id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(contract)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchContract(CONTRACT_ID);

    expect(fetchMock.mock.calls[0][0]).toBe(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${CONTRACT_ID}`);
  });

  it("accepts an EVM address as the lookup key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(contract)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchContract(EVM_ADDRESS);

    expect(fetchMock.mock.calls[0][0]).toBe(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${EVM_ADDRESS}`);
  });

  it("returns the deployed code, which is the field a release manifest is checked against", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(contract))));

    const result = await fetchContract(CONTRACT_ID);

    expect(result.runtime_bytecode?.startsWith("0x60806040")).toBe(true);
    expect(result.bytecode).toBe("0x");
  });

  it("hands back a null code rather than crashing, for a contract Mirror reports without one", async () => {
    const withoutCode = { ...contract, runtime_bytecode: null, bytecode: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(withoutCode))));

    const result = await fetchContract(CONTRACT_ID);

    expect(result.runtime_bytecode).toBeNull();
  });

  it("does not call fetch when the id is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContract("nope")).rejects.toThrow("Invalid contract ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a transaction hash, which the neighbouring result lookup does take", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchContract(`0x${"11".repeat(32)}`)).rejects.toThrow("Invalid contract ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
