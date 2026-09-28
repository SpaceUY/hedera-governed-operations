import type { ReactNode } from "react";
import { MEMBER_COPY } from "./copy";
import { monogramOf } from "~~/components/governance/graph/geometry";

export type SeatState = "signed" | "notYet" | "didNotSign";

export type CouncilMemberRowProps = {
  /** The seat's name as the map gives it — "You", a demo name, an account id or the start of a key. */
  name: string;
  /** The map's caption for the seat, when it has one ("demo co-signer"). */
  caption?: string;
  /** The account holding the seat, shown under the name when the name is not already it. */
  accountId?: string;
  isViewer: boolean;
  state: SeatState;
  /** In place of the state: the viewer's own Sign button, on the viewer's own row only. */
  action?: ReactNode;
};

const STATE_CLASSES: Record<SeatState, string> = {
  signed: "badge badge-success badge-sm",
  notYet: "badge badge-ghost badge-sm",
  didNotSign: "text-xs text-base-content/60",
};

/** One council seat: who holds it, and whether it has signed — or, for the viewer, the button to. */
export const CouncilMemberRow = ({ name, caption, accountId, isViewer, state, action }: CouncilMemberRowProps) => (
  <li className="flex items-center gap-3 border-t border-base-300 py-2 first:border-t-0">
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
        state === "signed" ? "border-success" : "border-base-content/30"
      }`}
    >
      {isViewer ? MEMBER_COPY.you : monogramOf(name)}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
        {name}
        {isViewer && <span className="badge badge-primary badge-sm">{MEMBER_COPY.yourWallet}</span>}
        {caption && <span className="badge badge-ghost badge-sm font-normal">{caption}</span>}
      </span>
      {accountId && accountId !== name && <span className="text-xs text-base-content/60">{accountId}</span>}
    </span>
    {action ?? <span className={`shrink-0 ${STATE_CLASSES[state]}`}>{MEMBER_COPY[state]}</span>}
  </li>
);
