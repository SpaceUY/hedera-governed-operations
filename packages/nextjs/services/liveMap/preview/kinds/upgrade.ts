import type { PreviewKind } from "./previewKind";

const WORDS = { next: "would become v2", other: "would be upgraded" } as const;

/** On the vault: v2 only when the implementation is the release this deployment recorded as next. */
export const UPGRADE_PREVIEW: PreviewKind<"upgrade"> = {
  labels: (operation, { vaultReleaseOf }) => [
    { ref: operation.target, text: vaultReleaseOf(operation.implementation) === "next" ? WORDS.next : WORDS.other },
  ],
};
