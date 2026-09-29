import type { PreviewKind } from "./previewKind";
import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";

const WORDS: Record<TokenAdminOperation, string> = {
  pause: "would be paused",
  unpause: "would resume",
  freeze: "would freeze 1 account",
  unfreeze: "would unfreeze 1 account",
};

/** On the token, not on the Token admin contract: the token is what changes state. */
export const TOKEN_ADMIN_PREVIEW: PreviewKind<"tokenAdmin"> = {
  labels: operation => [{ ref: operation.token, text: WORDS[operation.operation] }],
};
