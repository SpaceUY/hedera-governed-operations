import { appEnvEntries } from "./appEnv";
import { emptyState } from "./state";
import { describe, expect, it } from "vitest";

const account = { accountId: "0.0.8", privateKey: "k", publicKey: "p", evmAddress: "0xa" };

describe("appEnvEntries", () => {
  it("writes nothing for an empty state", () => {
    expect(appEnvEntries(emptyState("testnet"))).toEqual({});
  });

  it("maps the release topic to its public variable", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), releaseTopicId: "0.0.9" })).toEqual({
      NEXT_PUBLIC_RELEASE_TOPIC_ID: "0.0.9",
    });
  });

  it("maps each demo account id to its own public variable and never its key", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), demoAccounts: { alice: account } })).toEqual({
      NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID: "0.0.8",
    });
  });
});

describe("appEnvEntries for the governed-operations fixtures", () => {
  const governance = { accountId: "0.0.99", evmAddress: "0x63", councilAccountId: "0.0.5" };

  it("maps the governance account to its own public variable", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), governance })).toEqual({
      NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID: "0.0.99",
    });
  });

  it("maps the demo token", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), demoTokenId: "0.0.77" })).toEqual({
      NEXT_PUBLIC_DEMO_TOKEN_ID: "0.0.77",
    });
  });

  it("maps the seed proposal id", () => {
    const seedProposal = { id: 3, executorContractId: "0.0.11" };
    expect(appEnvEntries({ ...emptyState("testnet"), seedProposal })).toEqual({
      NEXT_PUBLIC_SEED_PROPOSAL_ID: "3",
    });
  });

  it("maps a seed proposal that is the first of its registry", () => {
    const seedProposal = { id: 0, executorContractId: "0.0.11" };
    expect(appEnvEntries({ ...emptyState("testnet"), seedProposal })).toEqual({
      NEXT_PUBLIC_SEED_PROPOSAL_ID: "0",
    });
  });
});

describe("appEnvEntries for the agent", () => {
  it("maps the agent's account to the variable the app names the co-signing agent by, not to a demo member's", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), demoAccounts: { agent: account } })).toEqual({
      NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID: "0.0.8",
    });
  });

  it("writes the decision topic under the agent's own name, since the app never reads it", () => {
    expect(appEnvEntries({ ...emptyState("testnet"), decisionTopicId: "0.0.31" })).toEqual({
      AGENT_DECISION_TOPIC_ID: "0.0.31",
    });
  });
});
