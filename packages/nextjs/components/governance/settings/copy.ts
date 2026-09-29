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
  },
} as const;
