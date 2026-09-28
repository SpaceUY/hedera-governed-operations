"use client";

/**
 * Demo only: "Sign as Alice" / "Sign as Bob". See `services/demoSigners/demoSigners.ts` for the
 * feature and the two steps that remove it.
 */
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useDemoSign, useDemoSigners } from "~~/hooks/useDemoSigners";
import { type DemoMember, demoMemberLabel, demoMembersToOffer } from "~~/services/demoSigners/demoSigners";
import type { Proposal } from "~~/services/governance/proposals";

type DemoSignButtonsProps = {
  proposal: Proposal;
  governanceAccountId: string;
  executorContractId: string;
  /** Re-reads the proposal once the network took a signature; the button never marks it signed itself. */
  onSigned: () => void;
};

/** A button per demo council member this proposal still waits on; nothing when the server has no demo keys. */
export function DemoSignButtons({ proposal, governanceAccountId, executorContractId, onSigned }: DemoSignButtonsProps) {
  const demoSigners = useDemoSigners();
  const council = useCouncil({ governanceAccountId, executorContractId });
  if (!demoSigners.data || !council.data) return null;

  const members = demoMembersToOffer(demoSigners.data, proposal, council.data.key);
  if (members.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {members.map(member => (
          <DemoSignButton
            key={member.name}
            member={member}
            scheduleId={proposal.schedule.schedule_id}
            onSigned={onSigned}
          />
        ))}
      </div>
      <p className="text-sm text-base-content/60">
        Demo council members: their keys were created by <code>yarn setup</code> and stay on this server, which signs
        for them. A signature counts once the Mirror Node shows it.
      </p>
    </div>
  );
}

type DemoSignButtonProps = { member: DemoMember; scheduleId: string; onSigned: () => void };

/**
 * One mutation per member, so signing as one never resets the other's state. After a success the
 * button stays disabled until the member drops out of the list, which happens when Mirror lists the
 * signature: re-enabling it earlier would invite a second, pointless `ScheduleSign`.
 */
function DemoSignButton({ member, scheduleId, onSigned }: DemoSignButtonProps) {
  const sign = useDemoSign();
  const label = demoMemberLabel(member.name);
  const text = sign.isSuccess ? `Submitted as ${label}, waiting for the Mirror Node` : `Sign as ${label}`;

  return (
    <div className="flex flex-col gap-1">
      <button
        className="btn btn-secondary"
        onClick={() => sign.mutate({ scheduleId, member: member.name }, { onSuccess: onSigned })}
        disabled={sign.isPending || sign.isSuccess}
      >
        {sign.isPending ? `Signing as ${label}…` : text}
      </button>
      {sign.error && (
        <p role="alert" className="text-sm text-error">
          {sign.error.message}
        </p>
      )}
    </div>
  );
}
