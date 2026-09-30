"use client";

import { useRef } from "react";
import { DEMO_SIGNER_COPY } from "./copy";
import { MutationError } from "~~/components/governance/MutationError";
import { useDemoSign, useDemoSignatureSent } from "~~/hooks/useDemoSigners";
import { type DemoMember, demoMemberLabel } from "~~/services/demoSigners/demoSigners";

type DemoSignButtonProps = {
  scheduleId: string;
  member: DemoMember;
  /** Re-reads the proposal once the network took the signature; the button never marks the seat signed itself. */
  onSigned: () => void;
};

/**
 * Demo only: one demo member's "Sign as …", on that member's row. One mutation per member, so signing
 * as one never resets the other's state. Once a signature was sent it stays disabled until the member
 * drops out of the list, which happens when Mirror lists the signature: enabling it earlier would invite
 * a second, pointless `ScheduleSign`. The mutation cache reaches the button a render late, so a quick
 * second press is stopped by a latch that opens again only when the server refused.
 */
export const DemoSignButton = ({ scheduleId, member, onSigned }: DemoSignButtonProps) => {
  const sign = useDemoSign();
  const label = demoMemberLabel(member.name);
  const sentBefore = useDemoSignatureSent(scheduleId, member.publicKey);
  const busy = sentBefore;
  const sent = useRef(false);
  const send = () => {
    if (sent.current) return;
    sent.current = true;
    sign.mutate(
      { scheduleId, member: member.name, memberKey: member.publicKey },
      {
        onSuccess: onSigned,
        onError: () => {
          sent.current = false;
        },
      },
    );
  };
  return (
    <div className="flex max-w-56 shrink-0 flex-col items-end gap-1 text-right">
      <button type="button" className="btn btn-primary btn-sm shrink-0" disabled={busy} onClick={send}>
        {busy ? DEMO_SIGNER_COPY.signingAs(label) : DEMO_SIGNER_COPY.signAs(label)}
      </button>
      <MutationError error={sign.error} />
    </div>
  );
};
