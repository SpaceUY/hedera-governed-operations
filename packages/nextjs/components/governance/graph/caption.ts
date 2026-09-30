/**
 * The line over the map that says what it is showing: nothing yet, a kind picked in the wizard (the
 * way it would go, once the map can draw it), a draft being written, the proposal selected in the
 * rail, or where a settled one went. Its words follow the legend's, so the
 * caption and the lines on the map describe the same thing.
 */
export type CaptionFacts =
  | { kind: "idle" }
  | { kind: "drafting"; title: string | null }
  | { kind: "sketching"; title: string }
  | { kind: "picked"; title: string }
  | { kind: "previewing"; title: string }
  | { kind: "history"; title: string }
  | { kind: "void"; title: string };

export type MapCaption = { lead: string; text: string };

const WORDS = {
  selectOne: "Select an operation to see what it would do.",
  drafting: "Drafting.",
  pickKind: "Pick an operation type.",
  history: "Mint is the path it took. It is done: the line stays only while it is selected.",
  void: "Muted dashes are the path it would have taken. It never ran.",
} as const;

/** `rule` is the council's, as the ledger has it now ("2-of-3"). */
export function mapCaptionOf(facts: CaptionFacts, rule: string): MapCaption {
  switch (facts.kind) {
    case "idle":
      return { lead: `Nothing moves until the ${rule} council signs.`, text: WORDS.selectOne };
    case "drafting":
      return {
        lead: WORDS.drafting,
        text: facts.title
          ? `Dashed violet is what “${facts.title}” would do once the ${rule} council signs.`
          : WORDS.pickKind,
      };
    case "sketching":
      return {
        lead: WORDS.drafting,
        text: `Dashed violet is the way “${facts.title}” would go. Fill in the form to see exactly what it would do.`,
      };
    case "picked":
      return { lead: WORDS.drafting, text: `Fill in the form to see where “${facts.title}” would go.` };
    case "previewing":
      return { lead: `${facts.title}.`, text: `Dashed violet is what would happen once the ${rule} council signs.` };
    case "history":
      return { lead: `${facts.title}.`, text: WORDS.history };
    case "void":
      return { lead: `${facts.title}.`, text: WORDS.void };
  }
}
