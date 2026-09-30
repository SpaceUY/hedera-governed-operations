// @vitest-environment node
import { type ProposalDraft, previewDraft, previewFunctionLabel } from "./draft";
import { draftTokenAdmin } from "./tokenAdmin";
import { PROPOSAL_TYPES } from "@sh/core/governance/proposalTypes";
import { describe, expect, it } from "vitest";

/** An ECDSA account's alias, lowercase as the Mirror Node serves it. */
const HOLDER_ALIAS = "0x5b38da6a701c568545dcfcb03fcb875f56beddc4";

describe("draftTokenAdmin", () => {
  const TOKEN_ADMIN_TARGETS = {
    tokenAdmin: "0x00000000000000000000000000000000000Ad000" as const,
    tokenAdminContractId: "0.0.4300",
    tokenId: "0.0.5449",
  };

  const registryOperation = (draft: ProposalDraft) => {
    const preview = previewDraft(draft);
    if (preview.path !== "registry") throw new Error("expected a registry preview");
    return preview;
  };

  it("pauses the token by its address, through TokenAdmin, with the measured gas", () => {
    const preview = registryOperation(draftTokenAdmin(TOKEN_ADMIN_TARGETS, { operation: "pause", holder: null }));

    expect(preview.target).toBe("Token admin · 0.0.4300");
    expect(preview.operation).toEqual({
      kind: "tokenAdmin",
      target: TOKEN_ADMIN_TARGETS.tokenAdmin,
      operation: "pause",
      token: "0x0000000000000000000000000000000000001549",
      account: null,
    });
    expect(preview.executeGas).toBe(PROPOSAL_TYPES.tokenAdmin.executeGas);
    expect(preview.payableTinybars).toBe(0n);
  });

  /** Its long-zero address is refused by the token system contract as INVALID_ACCOUNT_ID (15). */
  it("freezes one holder by the address the network knows it by, its alias when it has one", () => {
    const preview = registryOperation(
      draftTokenAdmin(TOKEN_ADMIN_TARGETS, { operation: "freeze", holder: HOLDER_ALIAS }),
    );

    expect(preview.operation).toMatchObject({
      kind: "tokenAdmin",
      operation: "freeze",
      account: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
    });
    expect(previewFunctionLabel(preview)).toBe("freeze(…)");
  });

  it("refuses a freeze that names no holder, with the encoder's reason", () => {
    expect(() => draftTokenAdmin(TOKEN_ADMIN_TARGETS, { operation: "freeze", holder: null })).toThrow(
      /needs the account to freeze/,
    );
  });
});
