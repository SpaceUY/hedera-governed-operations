import type { ReactNode } from "react";
import { CouncilMemberRow, type MemberSignature, type SeatState } from "./CouncilMemberRow";
import type { CouncilKey, Proposer, ThresholdProgress } from "@sh/core/governance/council";
import { mirrorTimestampToDate } from "@sh/core/mirror";
import type { MemberName } from "~~/components/governance/graph/mapModel";
import { memberLabel } from "~~/services/governance/proposalLabels";
import { type HederaNetworkName, getHashScanUrl } from "~~/utils/scaffold-hbar/networks";

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
  /** One below the panel's title: 2 on the detail route, 3 when the panel opens under a card. */
  headingLevel?: 2 | 3;
};

/**
 * Every seat of one council, one row each: who holds it — named as the map names it, "You" for the
 * connected account's own seat — and whether it has signed. The viewer's own row carries the Sign
 * button; nobody else's does. A council rotation renders this twice — see `ProposalDetailPanel` —
 * since the schedule waits for both the current council's threshold and the incoming one's own.
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
  headingLevel = 2,
}: ApproverListProps) => {
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
          const holder = proposers.find(proposer => proposer.key === key)?.accountId;
          const isViewer = holder !== undefined && holder === viewerAccountId;
          const state = stateOf(key);
          return (
            <CouncilMemberRow
              key={key}
              name={memberNames[key]?.name ?? memberLabel(key, proposers, viewerAccountId)}
              caption={memberNames[key]?.caption}
              accountId={holder}
              isViewer={isViewer}
              state={state}
              action={isViewer && state !== "signed" ? signAction : undefined}
              signature={signatureOf(key)}
            />
          );
        })}
      </ul>
    </section>
  );
};
