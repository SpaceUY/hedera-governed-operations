import type { CouncilKey } from "@sh/core/governance/council";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

/** One council seat as the map names it; `isViewer` marks the connected account's. */
export type SeatName = { label: string; isViewer: boolean };

/** "A, B and C": the members of a council as a sentence reads them. */
const listed = (names: string[]): string =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** The rule of the council with the agent seated: the same threshold over one more seat. */
export const seatedRule = ({ threshold, memberKeys }: CouncilKey): string => `${threshold}-of-${memberKeys.length + 1}`;

/** What seating the co-signing agent says about the council it changes and the one it proposes. */
export const CO_SIGNING_AGENT_COPY = {
  title: "Add the co-signing agent",
  accountLabel: "Agent account",
  pickerHint: (council: CouncilKey) => `→ ${seatedRule(council)} council`,
  /**
   * Who holds the seats once the agent sits, and — when no one key is enough — why that matters; split
   * so the form can set the new rule in bold.
   */
  newKey: (council: CouncilKey, seats: SeatName[]) => {
    const names = [...seats.map(seat => (seat.isViewer ? "your wallet" : seat.label)), "the agent"];
    const alone =
      council.threshold < 2
        ? ""
        : ` With the agent as one of ${names.length} keys and ${council.threshold} required, neither the agent ` +
          "nor any one person can act alone.";
    return {
      lead: "New treasury key: a ",
      rule: `${seatedRule(council)} council`,
      rest: ` — ${listed(names)}.${alone}`,
    };
  },
  bothCouncils: (council: CouncilKey) =>
    `Seating the agent takes two thresholds: the current ${councilRuleLabel(council)} ` +
    `council's, and the proposed ${seatedRule(council)} council's own. The schedule waits until both are met; it ` +
    "does not fail while it waits.",
  agentNeverSigns:
    "The co-signing agent never signs a council rotation, this one included: both thresholds have to be reached " +
    "by the council's human members.",
  notSingleKey: (accountId: string, keyType: string) =>
    `${accountId} holds a ${keyType} key. A seat on the council is one account's single key, so it cannot be ` +
    "the agent's seat.",
  notEcdsa: (accountId: string, keyType: string) =>
    `${accountId} holds an ${keyType} key. The co-signing agent signs with an ECDSA key, so its account has to ` +
    "hold one.",
  alreadyMember: (accountId: string) =>
    `${accountId} already holds a seat on the council, so seating it would change nothing. The agent needs an ` +
    "account of its own that is not a member yet.",
  agentSeated: (accountId: string) =>
    `${accountId}, the configured co-signing agent, already holds a seat on the council: there is nothing left ` +
    "to seat.",
} as const;
