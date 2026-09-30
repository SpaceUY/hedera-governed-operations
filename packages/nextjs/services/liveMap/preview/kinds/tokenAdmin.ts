import { type PreviewKind, configuredRefs } from "./previewKind";
import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

const WORDS: Record<TokenAdminOperation, string> = {
  pause: "would be paused",
  unpause: "would resume",
  freeze: "would freeze 1 account",
  unfreeze: "would unfreeze 1 account",
};

/** On the token, not on the Token admin contract: the token is what changes state. A sketch says nothing: which change is the form's. */
export const TOKEN_ADMIN_PREVIEW: PreviewKind<"tokenAdmin"> = {
  labels: operation => [{ ref: operation.token, text: WORDS[operation.operation] }],
  sketch: context => ({
    refs: {
      subject: configuredRefs(context, MAP_ENTITY_IDS.tokenAdmin),
      token: configuredRefs(context, MAP_ENTITY_IDS.token),
    },
    words: [],
  }),
};
