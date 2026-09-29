/**
 * Every word the Settings screen says: the council as the ledger has it, the composer that proposes a
 * change to it, and the registry's roles. Proposal-state words stay in `proposalLabels.ts`, the
 * wizard's in `wizard/copy.ts`, the map caption's in `graph/caption.ts`.
 */
export const SETTINGS_COPY = {
  heading: "Settings",
  back: "← Map",
  backLabel: "Back to the map",
  council: {
    heading: "Council · native Hedera",
    ruleSuffix: "signatures move the treasury",
    note:
      "These approvers don’t exist in any contract. They are the keys inside the treasury account’s ThresholdKey, " +
      "read from the Mirror Node — not from the EVM.",
    /** `rule` is the council seating the agent would make: the current threshold over one more seat. */
    agentNotSeated: (rule: string) => `Not seated. Tick it below to propose a ${rule} council.`,
    loading: "Reading the council from the Mirror Node…",
    unreadable: "Could not read the council from the Mirror Node right now. It is read again on the next visit.",
  },
} as const;
