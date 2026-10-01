import type { ReactNode } from "react";
import { SeatAvatar } from "./SeatAvatar";
import { MEMBER_COPY, signedWhenAriaLabel, signedWhenLabel } from "./copy";
import { monogramOf } from "~~/components/governance/graph/geometry";

export type SeatState = "signed" | "notYet" | "didNotSign";

export type CouncilMemberRowProps = {
  /** The seat's name as the map gives it — "You", a demo name, an account id or the start of a key. */
  name: string;
  /** The map's caption for the seat, when it has one ("demo co-signer"). */
  caption?: string;
  /** In place of the caption: a badge another part of the screen puts on the seat ("demo key"). */
  badge?: ReactNode;
  /** In place of the name's first letter in the avatar, for a seat whose name does not start its own ("AG"). */
  monogram?: string;
  /** The account holding the seat, shown under the name when the name is not already it. */
  accountId?: string;
  isViewer: boolean;
  /** Whether it has signed; absent where the list is about who sits, not about a proposal. */
  state?: SeatState;
  /** In place of the state: the viewer's own Sign button, on the viewer's own row only. */
  action?: ReactNode;
  /** When the seat's signature landed, and that transaction on HashScan; a signed seat without one reads "Signed". */
  signature?: MemberSignature;
};

export type MemberSignature = { at: Date; href: string };

const STATE_CLASSES: Record<SeatState, string> = {
  signed: "badge badge-success badge-sm",
  notYet: "chip",
  didNotSign: "text-xs text-base-content/60",
};

/** One council seat: who holds it, and whether it has signed — and when — or, for the viewer, the button to. */
export const CouncilMemberRow = ({
  name,
  caption,
  badge,
  monogram,
  accountId,
  isViewer,
  state,
  action,
  signature,
}: CouncilMemberRowProps) => (
  <li className="flex items-center gap-3 border-t border-base-300 py-2 first:border-t-0">
    <SeatAvatar
      label={isViewer ? MEMBER_COPY.you : (monogram ?? monogramOf(name))}
      tone={state === "signed" ? "signed" : "plain"}
    />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
        {name}
        {isViewer && <span className="badge badge-primary badge-sm">{MEMBER_COPY.yourWallet}</span>}
        {badge ?? (caption && <span className="chip font-normal">{caption}</span>)}
      </span>
      {accountId && accountId !== name && <span className="text-xs text-base-content/60">{accountId}</span>}
    </span>
    {action ?? (state && <SeatStatus name={name} state={state} signature={signature} />)}
  </li>
);

const SeatStatus = ({ name, state, signature }: { name: string; state: SeatState; signature?: MemberSignature }) => {
  if (state === "signed" && signature) return <SignedWhen name={name} signature={signature} />;
  return <span className={`shrink-0 ${STATE_CLASSES[state]}`}>{MEMBER_COPY[state]}</span>;
};

const SignedWhen = ({ name, signature }: { name: string; signature: MemberSignature }) => {
  const when = signedWhenLabel(signature.at);
  return (
    <a
      href={signature.href}
      target="_blank"
      rel="noreferrer"
      aria-label={signedWhenAriaLabel(name, when)}
      className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap text-success-ink hover:underline"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="size-3.5 fill-none stroke-current"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      {when}
    </a>
  );
};
