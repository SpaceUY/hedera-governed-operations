import type { PreviewKind } from "./previewKind";

const WORDS = { joins: "would join the council", leaves: "would leave the council" } as const;

/** On each seat that changes: the incoming keys the council lacks, and the current keys the incoming one drops. */
export const COUNCIL_ROTATION_PREVIEW: PreviewKind<"councilRotation"> = {
  labels: (operation, { council }) => {
    const incoming = operation.council.memberKeys;
    return [
      ...incoming.filter(key => !council.memberKeys.includes(key)).map(ref => ({ ref, text: WORDS.joins })),
      ...council.memberKeys.filter(key => !incoming.includes(key)).map(ref => ({ ref, text: WORDS.leaves })),
    ];
  },
};
