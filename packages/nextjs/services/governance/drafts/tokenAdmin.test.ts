// @vitest-environment node
import { type ProposalDraft, previewDraft, previewFunctionLabel } from "./draft";
import { draftTokenAdmin } from "./tokenAdmin";
import { PROPOSAL_TYPES } from "@sh/core/governance/proposalTypes";
import { describe, expect, it } from "vitest";

const HOLDER = "0.0.500";

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
    const preview = registryOperation(draftTokenAdmin(TOKEN_ADMIN_TARGETS, { operation: "pause", accountId: null }));

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

  it("freezes one holder, named by its long-zero address", () => {
    const preview = registryOperation(draftTokenAdmin(TOKEN_ADMIN_TARGETS, { operation: "freeze", accountId: HOLDER }));

    expect(preview.operation).toMatchObject({
      kind: "tokenAdmin",
      operation: "freeze",
      account: "0x00000000000000000000000000000000000001F4",
    });
    expect(previewFunctionLabel(preview)).toBe("freeze(…)");
  });

  it("refuses a freeze that names no holder, with the encoder's reason", () => {
    expect(() => draftTokenAdmin(TOKEN_ADMIN_TARGETS, { operation: "freeze", accountId: null })).toThrow(
      /needs the account to freeze/,
    );
  });
});
