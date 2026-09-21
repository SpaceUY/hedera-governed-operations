import { appEnvEntries } from "./appEnv";
import { emptyState } from "./state";
import { describe, expect, it } from "vitest";

const account = { accountId: "0.0.8", privateKey: "k", publicKey: "p", evmAddress: "0xa" };

describe("appEnvEntries", () => {
  it("writes nothing for an empty state", () => {
    expect(appEnvEntries(emptyState("testnet"))).toEqual({});
  });

  it("maps the topic to the Proof Wall variable", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), topicId: "0.0.7" })).toEqual({
      NEXT_PUBLIC_PROOF_WALL_TOPIC_ID: "0.0.7",
    });
  });

  it("maps each demo account id to its own public variable and never its key", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), demoAccounts: { alice: account } })).toEqual({
      NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID: "0.0.8",
    });
  });
});
