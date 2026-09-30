import type { ReactNode } from "react";
import { CouncilMemberRow, type MemberSignature, type SeatState } from "./CouncilMemberRow";
import { councilSeatOf } from "./councilSeats";
import type { CouncilKey, Proposer, ThresholdProgress } from "@sh/core/governance/council";
import { mirrorTimestampToDate } from "@sh/core/mirror";
import type { MemberName } from "~~/components/governance/graph/mapModel";
import type { CoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { type HederaNetworkName, getHashScanUrl } from "~~/utils/scaffold-hbar/networks";

/** What a screen adds to one seat's row: a caption in place of the map's, an action in place of the status. */
export type SeatExtra = { caption?: string; action?: ReactNode };

export type ApproverListProps = {
  heading: string;
  council: CouncilKey;
  progress: ThresholdProgress;
  proposers: readonly Proposer[];
  viewerAccountId: string | null;
  /** The seats as the map names them, by key; a seat the map does not show falls back to `memberLabel`. */
  memberNames?: Readonly<Record<string, MemberName>>;
  /** Whether signatures are still being collected: a seat that has not signed reads "Not yet" rather than "Didn't sign". */
  isCollecting: boolean;
  /**
   * The consensus timestamp of each signed seat's signature, by member key (`memberSignedAt`), and
   * the network to link it on; a seat missing from it reads "Signed" without a time.
   */
  signedAt?: Readonly<Record<string, string>>;
  network?: HederaNetworkName;
  /** Put on the viewer's own row, while it has not signed. */
  signAction?: ReactNode;
  /**
   * What another part of the screen puts on seats that are not the viewer's, by member key. An action
   * shows only while that seat has not signed; the viewer's own row keeps `signAction`.
   */
  seatExtras?: Readonly<Record<string, SeatExtra>>;
  /** The co-signing agent, when the app knows its account: the seat its key holds is named as the agent. */
  agent?: CoSigningAgent | null;
  /** Rows after the members' — the co-signing agent's, while it holds no seat. */
  children?: ReactNode;
  /** One below the panel's title: 2 on the detail route, 3 when the panel opens under a card. */
  headingLevel?: 2 | 3;
};

/**
 * Every seat of one council, one row each: who holds it — named as the map names it, "You" for the
 * connected account's own seat — and whether it has signed. The viewer's own row carries the Sign
 * button; another seat carries only what `seatExtras` gives it. A council rotation renders this twice —
 * see `ProposalDetailPanel` — since the schedule waits for both the current council's threshold and the
 * incoming one's own.
 */
export const ApproverList = ({
  heading,
  council,
  progress,
  proposers,
  viewerAccountId,
  memberNames = {},
  isCollecting,
  signedAt = {},
  network,
  signAction,
  seatExtras = {},
  agent,
  children,
  headingLevel = 2,
}: ApproverListProps) => {
  const naming = { proposers, viewerAccountId, memberNames, agent };
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const stateOf = (key: string): SeatState =>
    progress.signedBy.includes(key) ? "signed" : isCollecting ? "notYet" : "didNotSign";
  const signatureOf = (key: string): MemberSignature | undefined => {
    const at = mirrorTimestampToDate(signedAt[key]);
    return at && network ? { at, href: getHashScanUrl(network, "transaction", signedAt[key]) } : undefined;
  };
  return (
    <section aria-label={heading} className="flex flex-col gap-1">
      <Heading className="m-0 text-xs font-semibold text-base-content/70">{heading}</Heading>
      <ul className="m-0 flex list-none flex-col p-0">
        {council.memberKeys.map(key => {
          const seat = councilSeatOf(key, naming);
          const state = stateOf(key);
          const extra = seatExtras[key];
          const action = seat.isViewer ? signAction : extra?.action;
          return (
            <CouncilMemberRow
              key={key}
              {...seat}
              caption={extra?.caption ?? seat.caption}
              state={state}
              action={state === "signed" ? undefined : action}
              signature={signatureOf(key)}
            />
          );
        })}
        {children}
      </ul>
    </section>
  );
};
