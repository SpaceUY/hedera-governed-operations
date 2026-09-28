/** What the council rotation form says about the council it replaces and the one it proposes. */
export const COUNCIL_ROTATION_COPY = {
  currentCouncil: (rule: string) => `Current council: ${rule}.`,
  replacesWholeKey:
    "The proposed council replaces the treasury's whole key: list every member it should have, the ones staying " +
    "included. Each member is an account, and its own key becomes one seat.",
  memberLabel: (position: number) => `Member ${position}`,
  removeMember: (position: number) => `Remove member ${position}`,
  addMember: "Add a member",
  thresholdLabel: "Signatures required",
  thresholdOf: (seats: number) => `of ${seats}`,
  bothCouncils: (currentRule: string | null, proposedRule: string) =>
    `Changing the council takes two thresholds: the current${currentRule ? ` ${currentRule}` : ""} council's, and ` +
    `the proposed ${proposedRule} council's own. The schedule waits until both are met; it does not fail while it waits.`,
  agentNeverSigns:
    "A co-signing agent never signs a council rotation, whatever its policy says: if one holds a seat, the current " +
    "council's threshold has to be reached by its human members.",
  notSingleKey: (accountId: string, keyType: string) =>
    `${accountId} holds a ${keyType} key. A seat on the council is one account's single key, so it cannot be a member.`,
} as const;
