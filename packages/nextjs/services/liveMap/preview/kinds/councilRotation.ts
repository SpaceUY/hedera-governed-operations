import type { PreviewKind } from "./previewKind";

const WORDS = { joins: "would join the council", leaves: "would leave the council" } as const;

/**
 * On each seat that changes: the incoming keys the council lacks, and the current keys the incoming
 * one drops. The wizard's rotation seats the co-signing agent, so a sketch adds its key once read;
 * the seat keeps the demo's ghost look, so a sketch puts no words on it.
 */
export const COUNCIL_ROTATION_PREVIEW: PreviewKind<"councilRotation"> = {
  labels: (operation, { council }) => {
    const incoming = operation.council.memberKeys;
    return [
      ...incoming.filter(key => !council.memberKeys.includes(key)).map(ref => ({ ref, text: WORDS.joins })),
      ...council.memberKeys.filter(key => !incoming.includes(key)).map(ref => ({ ref, text: WORDS.leaves })),
    ];
  },
  sketch: ({ governanceAccountId, agentSeat }) => ({
    refs: { governanceAccount: [governanceAccountId], member: agentSeat ? [agentSeat] : [] },
    words: [],
  }),
};
