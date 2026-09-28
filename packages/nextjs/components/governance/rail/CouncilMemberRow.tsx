export type CouncilMemberRowProps = { label: string; hasSigned: boolean };

/** One council seat: who holds it, and whether it has signed yet. */
export const CouncilMemberRow = ({ label, hasSigned }: CouncilMemberRowProps) => (
  <li className="flex items-center justify-between gap-2 text-sm">
    <span className="break-all">{label}</span>
    <span className={hasSigned ? "badge badge-success badge-sm" : "badge badge-ghost badge-sm"}>
      {hasSigned ? "Signed" : "Not yet"}
    </span>
  </li>
);
