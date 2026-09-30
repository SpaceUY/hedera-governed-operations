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
  composer: {
    heading: "Propose a council change · native",
    intro: (rule: string) =>
      `Choose who holds a key and how many must sign. This is a native scheduled update of the treasury’s own key, ` +
      `approved by the current ${rule} council and by the council it proposes.`,
    membersLegend: "Council members",
    tags: { joins: "joins", leaves: "leaves" },
    thresholdLabel: "Signatures required",
    fewer: "One fewer signature",
    more: "One more signature",
    risks: {
      anyOneKey: (seats: number) => `A 1-of-${seats} council lets any single key move the treasury alone.`,
      oneLostKeyFreezes: (seats: number) =>
        `In a ${seats}-of-${seats} council, one lost key would freeze the treasury.`,
      viewerLeaves: (keepsProposerRole: boolean) =>
        `Your wallet would no longer be a council key.${keepsProposerRole ? " You would keep PROPOSER_ROLE." : ""}`,
    },
    agentAlone: (seats: number, threshold: number) =>
      `With the agent as one of ${seats} keys and ${threshold} required, neither the agent nor any one person can act alone.`,
    bothCouncils: (currentRule: string, proposedRule: string) =>
      `Changing the council takes two thresholds: the current ${currentRule} council's, and the proposed ` +
      `${proposedRule} council's own. The schedule waits until both are met; it does not fail while it waits.`,
    /** A council the seats besides the agent's can never reach: the change could never execute. */
    agentBlocks: (otherKeys: number, rule: string) =>
      otherKeys === 0
        ? `The co-signing agent never signs a council rotation, so a ${rule} council of the agent alone could never approve this change: it could never run.`
        : `The co-signing agent never signs a council rotation, so the other ${otherKeys} ${otherKeys === 1 ? "key" : "keys"} can’t reach ${rule}: this change could never run.`,
    agentNeverSigns:
      "A co-signing agent never signs a council rotation, whatever its policy says: if one holds a seat, both " +
      "thresholds have to be reached by the council's human members.",
    note: "One transaction. The map shows the council this would create in dashed violet.",
    /** The rows that seat an account holding no seat yet; its own key becomes the seat. */
    members: {
      legend: "Accounts to add",
      memberLabel: (position: number) => `Member ${position}`,
      removeMember: (position: number) => `Remove member ${position}`,
      addMember: "Add a member",
      emptyMember: (position: number) => `Member ${position} is empty: fill it in or remove it.`,
      notSingleKey: (accountId: string, keyType: string) =>
        `${accountId} holds a ${keyType} key. A seat on the council is one account's single key, so it cannot be a member.`,
      alreadyOffered: (accountId: string) =>
        `${accountId} already holds a seat listed above, so this row adds nothing: tick or untick that seat instead.`,
    },
  },
  roles: {
    heading: "Contract roles · EVM · proposal registry",
    proposer: "PROPOSER_ROLE",
    executor: "EXECUTOR_ROLE",
    admin: "Role admin",
    yourWallet: "Your wallet",
    onlyTreasury: (accountId: string) => `Treasury account ${accountId} — the only holder`,
    registryItself: "The registry itself",
    /** Holders as the addresses they were granted under, when they are not what the deployment set up. */
    holders: (addresses: readonly string[]) => (addresses.length === 0 ? "Nobody" : addresses.join(", ")),
    unresolvable: (addresses: readonly string[]) =>
      `Also granted to ${addresses.join(", ")}, which no account on the Mirror Node answers for.`,
    note: "Because the registry administers its own roles, changing who may propose is itself a proposal the council approves.",
    loading: "Reading the registry's roles…",
    unreadable: "Could not read the registry's roles through the JSON-RPC relay right now.",
    proposersUnreadable: "Could not read who holds PROPOSER_ROLE right now. It is read again on the next visit.",
  },
} as const;
