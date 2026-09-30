import { signsScheduleDelete, walletNameOf } from "./walletCapabilities";
import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import { describe, expect, it } from "vitest";

type Session = NonNullable<HederaProvider["session"]>;

const sessionOf = (name: string) =>
  ({ peer: { publicKey: "ab", metadata: { name, description: "", url: "", icons: [] } } }) as unknown as Session;

describe("walletNameOf", () => {
  it("reads the name the wallet sent in the session's peer metadata", () => {
    expect(walletNameOf(sessionOf("HashPack"))).toBe("HashPack");
  });

  it("is null without a session, or when the wallet sent no name", () => {
    expect(walletNameOf(undefined)).toBeNull();
    expect(walletNameOf(sessionOf(""))).toBeNull();
  });
});

describe("signsScheduleDelete", () => {
  it.each(["HashPack", "hashpack", "HASHPACK", " HashPack Wallet "])("is false for %j", name => {
    expect(signsScheduleDelete(name)).toBe(false);
  });

  it.each(["Kabila", "Kabila Wallet", "Some Other Wallet", ""])("is true for %j", name => {
    expect(signsScheduleDelete(name)).toBe(true);
  });

  it("is true without a wallet name: the test signer, or nothing connected", () => {
    expect(signsScheduleDelete(null)).toBe(true);
  });
});
