import { type PreviewKind, configuredRefs } from "./previewKind";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

const WORDS = { next: "would become v2", other: "would be upgraded" } as const;

/** On the vault: v2 only when the implementation is the release this deployment recorded as next. */
export const UPGRADE_PREVIEW: PreviewKind<"upgrade"> = {
  labels: (operation, { vaultReleaseOf }) => [
    { ref: operation.target, text: vaultReleaseOf(operation.implementation) === "next" ? WORDS.next : WORDS.other },
  ],
  sketch: context => ({
    refs: { subject: configuredRefs(context, MAP_ENTITY_IDS.vault) },
    words: [{ role: "subject", text: WORDS.other }],
  }),
};
