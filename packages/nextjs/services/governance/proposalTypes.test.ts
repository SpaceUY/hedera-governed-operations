import { CONTRACT_PROPOSAL_KINDS, PROPOSAL_TYPES, type ProposalKind, isContractProposalKind } from "./proposalTypes";
import { describe, expect, it } from "vitest";

describe("isContractProposalKind", () => {
  it("is true exactly for the kinds with an execute gas limit", () => {
    const withGas = (Object.keys(PROPOSAL_TYPES) as ProposalKind[]).filter(
      kind => PROPOSAL_TYPES[kind].executeGas !== null,
    );
    expect([...CONTRACT_PROPOSAL_KINDS].sort()).toEqual(withGas.sort());
    expect(isContractProposalKind("upgrade")).toBe(true);
    expect(isContractProposalKind("treasuryTransfer")).toBe(false);
  });
});
