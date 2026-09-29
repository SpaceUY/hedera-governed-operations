import { PREVIEW_CONTEXT } from "./previewFixtures";
import { TOKEN_ADMIN_PREVIEW } from "./tokenAdmin";
import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";
import { describe, expect, it } from "vitest";

const TOKEN = "0x0000000000000000000000000000000000001770";
const act = (operation: TokenAdminOperation) => ({
  kind: "tokenAdmin" as const,
  target: "0x5aF0000000000000000000000000000000000002",
  operation,
  token: TOKEN,
  account: operation.includes("freeze") ? "0x0000000000000000000000000000000000001b58" : null,
});

describe("TOKEN_ADMIN_PREVIEW", () => {
  it.each([
    ["pause", "would be paused"],
    ["unpause", "would resume"],
    ["freeze", "would freeze 1 account"],
    ["unfreeze", "would unfreeze 1 account"],
  ] as const)("%s puts “%s” on the token", (operation, text) => {
    expect(TOKEN_ADMIN_PREVIEW.labels(act(operation), PREVIEW_CONTEXT)).toEqual([{ ref: TOKEN, text }]);
  });
});
