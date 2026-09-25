import tokenRelationships from "./__fixtures__/token-relationships.json";
import token from "./__fixtures__/token.json";
import { fetchToken, fetchTokenRelationship, parseTokenDecimals } from "./tokens";
import { afterEach, describe, expect, it, vi } from "vitest";

const TOKEN_ID = "0.0.10671171";
const TREASURY_ID = "0.0.8192684";
/** The form a decoded `tokenAdmin` proposal carries, EIP-55 checksummed as viem returns it. */
const TOKEN_EVM_ADDRESS = "0x0000000000000000000000000000000000A2d443";
const ACCOUNT_EVM_ADDRESS = "0x00000000000000000000000000000000007d02ac";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseTokenDecimals", () => {
  it("reads the string form that GET /tokens/{id} returns", () => {
    expect(parseTokenDecimals("8")).toBe(8);
  });

  it("reads the number form that the account relationship returns", () => {
    expect(parseTokenDecimals(8)).toBe(8);
  });

  it("rejects a value that is not a whole count of decimals", () => {
    expect(() => parseTokenDecimals("eight")).toThrow("Invalid token decimals");
  });

  it("rejects the empty and blank strings instead of reading them as zero decimals", () => {
    expect(() => parseTokenDecimals("")).toThrow("Invalid token decimals");
    expect(() => parseTokenDecimals("   ")).toThrow("Invalid token decimals");
  });

  it("rejects a field Mirror left null, which arrives untyped through the client", () => {
    expect(() => parseTokenDecimals(null as unknown as string)).toThrow("Invalid token decimals");
  });

  it("rejects notations JavaScript would accept but a decimals field never uses", () => {
    expect(() => parseTokenDecimals("0x8")).toThrow("Invalid token decimals");
    expect(() => parseTokenDecimals("1e2")).toThrow("Invalid token decimals");
  });

  it("rejects a count no amount this template renders could use", () => {
    expect(() => parseTokenDecimals(21)).toThrow("Invalid token decimals");
  });
});

describe("fetchToken", () => {
  it("requests /api/v1/tokens/{id}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(token)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchToken(TOKEN_ID);

    expect(fetchMock.mock.calls[0][0]).toBe(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${TOKEN_ID}`);
  });

  it("returns the symbol and the admin keys the screens read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(token))));

    const result = await fetchToken(TOKEN_ID);

    expect(result.symbol).toBe("GOVD");
    expect(result.pause_status).toBe("UNPAUSED");
    expect(result.pause_key).not.toBeNull();
  });

  it("accepts the EVM address a decoded proposal carries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(token)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchToken(TOKEN_EVM_ADDRESS);

    expect(fetchMock.mock.calls[0][0]).toBe(`https://testnet.mirrornode.hedera.com/api/v1/tokens/${TOKEN_EVM_ADDRESS}`);
  });

  it("does not call fetch when the token id is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchToken("nope")).rejects.toThrow("Invalid token ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchTokenRelationship", () => {
  it("asks the account endpoint filtered by token id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenRelationships)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTokenRelationship(TREASURY_ID, TOKEN_ID);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://testnet.mirrornode.hedera.com/api/v1/accounts/${TREASURY_ID}/tokens?token.id=${TOKEN_ID}`,
    );
  });

  it("returns the freeze status of the account for that token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenRelationships))));

    const relationship = await fetchTokenRelationship(TREASURY_ID, TOKEN_ID);

    expect(relationship?.freeze_status).toBe("UNFROZEN");
  });

  it("returns null when the account never associated the token", async () => {
    const empty = { tokens: [], links: { next: null } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(empty))));

    await expect(fetchTokenRelationship("0.0.10671142", TOKEN_ID)).resolves.toBeNull();
  });

  it("accepts the EVM addresses a decoded freeze proposal carries on both sides", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokenRelationships)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchTokenRelationship(ACCOUNT_EVM_ADDRESS, TOKEN_EVM_ADDRESS);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://testnet.mirrornode.hedera.com/api/v1/accounts/${ACCOUNT_EVM_ADDRESS}/tokens?token.id=${TOKEN_EVM_ADDRESS}`,
    );
  });

  it("ignores a row for a token other than the one asked for", async () => {
    const otherToken = {
      tokens: [{ ...tokenRelationships.tokens[0], token_id: "0.0.999", freeze_status: "FROZEN" }],
      links: { next: null },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(otherToken))));

    await expect(fetchTokenRelationship(TREASURY_ID, TOKEN_ID)).resolves.toBeNull();
  });

  it("does not call fetch when either id is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTokenRelationship("nope", TOKEN_ID)).rejects.toThrow("Invalid account ID");
    await expect(fetchTokenRelationship(TREASURY_ID, "nope")).rejects.toThrow("Invalid token ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
