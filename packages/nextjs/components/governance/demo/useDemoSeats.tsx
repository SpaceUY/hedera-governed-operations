"use client";

import type { ReactNode } from "react";
import { DemoSignButton } from "./DemoSignButton";
import { DEMO_SIGNER_COPY } from "./copy";
import type { CouncilKey } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import type { SeatExtra } from "~~/components/governance/rail/ApproverList";
import { ROTATION_ONE_SIGNATURE } from "~~/components/governance/rail/copy";
import { useDemoSigners } from "~~/hooks/useDemoSigners";
import { type DemoSeat, demoMemberLabel, demoSeatPlan } from "~~/services/demoSigners/demoSigners";

type SeatExtras = Readonly<Record<string, SeatExtra>>;

export type DemoSeats = { extras: SeatExtras; incomingExtras: SeatExtras; note: string | null };

type DemoSeatsInput = {
  proposal: Proposal;
  /** The current council, once read. */
  council: CouncilKey | undefined;
  onSigned: () => void;
};

const NO_DEMO_SEATS: DemoSeats = { extras: {}, incomingExtras: {}, note: null };

/** Tinted like the viewer's own "your wallet" badge, softer, since it marks whose key signs rather than whose wallet. */
const DEMO_KEY_BADGE = <span className="badge badge-soft badge-primary badge-sm">{DEMO_SIGNER_COPY.badge}</span>;

/**
 * Demo only: what the rail's council lists add for the demo co-signers this server can sign for — the
 * "demo key" badge on their rows, a "Sign as …" while the proposal still waits on them, and the note
 * saying where their keys live. Nothing at all when the server offers no demo member.
 */
export function useDemoSeats({ proposal, council, onSigned }: DemoSeatsInput): DemoSeats {
  const members = useDemoSigners().data;
  if (!members?.length || !council) return NO_DEMO_SEATS;

  const plan = demoSeatPlan(members, proposal, council);
  const scheduleId = proposal.schedule.schedule_id;
  const actionOf = ({ member, offer }: DemoSeat): ReactNode => {
    // Keyed by the proposal so a button that already sent its signature is never reused for another one.
    if (offer === "sign") {
      return <DemoSignButton key={scheduleId} scheduleId={scheduleId} member={member} onSigned={onSigned} />;
    }
    if (offer === "countsAbove")
      return <span className="shrink-0 text-xs text-base-content/60">{ROTATION_ONE_SIGNATURE}</span>;
    return undefined;
  };
  const extrasOf = (seats: DemoSeat[]): SeatExtras =>
    Object.fromEntries(seats.map(seat => [seat.member.publicKey, { badge: DEMO_KEY_BADGE, action: actionOf(seat) }]));
  const seated = [...Object.values(plan.current), ...Object.values(plan.incoming)].map(({ member }) =>
    demoMemberLabel(member.name),
  );
  const names = [...new Set(seated)];
  return {
    extras: extrasOf(Object.values(plan.current)),
    incomingExtras: extrasOf(Object.values(plan.incoming)),
    note: names.length > 0 ? DEMO_SIGNER_COPY.note(names) : null,
  };
}
