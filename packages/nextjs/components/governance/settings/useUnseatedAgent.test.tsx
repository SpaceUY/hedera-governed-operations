import { useUnseatedAgent } from "./useUnseatedAgent";
import { PrivateKey } from "@hiero-ledger/sdk";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CO_SIGNING_AGENT_COPY } from "~~/components/governance/wizard/kinds/coSigningAgent/copy";
import { useAccount } from "~~/hooks/mirror/useAccount";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));

const ecdsa = { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() };
const ed25519 = { _type: "ED25519", key: PrivateKey.generateED25519().publicKey.toStringRaw() };
const seat = (key: { _type: string; key: string }) => memberKeyOfAccount(key) ?? "";
const COUNCIL = { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] };

const readAccount = (key: { _type: string; key: string }) =>
  vi
    .mocked(useAccount)
    .mockReturnValue({ data: { account: "0.0.600", key }, error: null } as unknown as ReturnType<typeof useAccount>);

afterEach(() => {
  vi.clearAllMocks();
});

describe("useUnseatedAgent", () => {
  it("is null without an agent, without a council, or while the council seats the agent", () => {
    readAccount(ecdsa);
    const agent = { accountId: "0.0.600", seat: seat(ecdsa) };
    expect(renderHook(() => useUnseatedAgent(null, COUNCIL, "testnet")).result.current).toBeNull();
    expect(renderHook(() => useUnseatedAgent(agent, undefined, "testnet")).result.current).toBeNull();
    const seated = { threshold: 2, memberKeys: ["key-a", seat(ecdsa)] };
    expect(renderHook(() => useUnseatedAgent(agent, seated, "testnet")).result.current).toBeNull();
  });

  it("finds the seat an unseated ECDSA agent could take", () => {
    readAccount(ecdsa);
    const agent = { accountId: "0.0.600", seat: seat(ecdsa) };
    const { result } = renderHook(() => useUnseatedAgent(agent, COUNCIL, "testnet"));
    expect(result.current).toMatchObject({ seat: seat(ecdsa), check: { status: "found" } });
    expect(useAccount).toHaveBeenCalledWith("0.0.600", { network: "testnet" });
  });

  it("says why an agent holding an ED25519 key cannot take a seat", () => {
    readAccount(ed25519);
    const agent = { accountId: "0.0.600", seat: seat(ed25519) };
    const { result } = renderHook(() => useUnseatedAgent(agent, COUNCIL, "testnet"));
    expect(result.current?.check).toEqual({
      status: "invalid",
      message: CO_SIGNING_AGENT_COPY.notEcdsa("0.0.600", "ED25519"),
    });
  });
});
