import { type DraftPreview, previewFunctionLabel } from "./drafts";
import type { CouncilKey } from "~~/services/governance/council";
import { PROPOSAL_PATH_CHIPS, approverLabel, expiryLabel, gasLimitLabel } from "~~/services/governance/proposalLabels";
import { describeRegistryOperation, describeScheduledOperation } from "~~/services/governance/proposalTypes";
import { PROPOSAL_EXPIRY_SECONDS } from "~~/services/governance/schedules";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

type CouncilPreviewPanelProps = { preview: DraftPreview; council: CouncilKey | undefined };

const unreadableReason = (preview: DraftPreview): string | null => {
  if (preview.path === "native") return preview.scheduled.kind === "unrecognized" ? preview.scheduled.reason : null;
  return preview.operation.kind === "unrecognized" ? preview.operation.reason : null;
};

const summaryOf = (preview: DraftPreview): string =>
  preview.path === "native"
    ? describeScheduledOperation(preview.scheduled)
    : describeRegistryOperation(preview.operation);

export const CouncilPreviewPanel = ({ preview, council }: CouncilPreviewPanelProps) => {
  const reason = unreadableReason(preview);
  const chips = PROPOSAL_PATH_CHIPS[preview.kind];

  return (
    <section
      aria-label="What the council will see"
      className="rounded-box border border-dashed border-primary p-4 flex flex-col gap-3"
    >
      <h3 className="m-0 text-sm font-bold">What the council will see</h3>
      {reason ? (
        <p role="alert" className="m-0 text-[13.5px] text-error">
          The council could not read this proposal, so it cannot be submitted: {reason}
        </p>
      ) : (
        <p className="m-0 text-[13.5px] leading-normal">{summaryOf(preview)}</p>
      )}

      <div aria-label="Path it travels" className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip, index) => (
          <span key={`${chip}-${index}`} className="contents">
            <span className="badge badge-outline border-dashed border-primary text-primary font-semibold text-[12.5px]">
              {chip}
            </span>
            {index < chips.length - 1 && <span className="text-[13px] text-base-content/60">→</span>}
          </span>
        ))}
      </div>

      <dl className="m-0 grid grid-cols-[128px_minmax(0,1fr)] gap-x-3 gap-y-[7px] text-[13px]">
        <dt className="text-base-content/60">Target</dt>
        <dd className="m-0 break-words">{preview.target}</dd>
        {!reason && (
          <>
            <dt className="text-base-content/60">Function</dt>
            <dd className="m-0 break-words">{previewFunctionLabel(preview)}</dd>
          </>
        )}
        {preview.path === "registry" && preview.payableTinybars > 0n && (
          <>
            <dt className="text-base-content/60">HBAR sent</dt>
            <dd className="m-0">{formatTinybars(preview.payableTinybars)}</dd>
          </>
        )}
        <dt className="text-base-content/60">Gas limit</dt>
        <dd className="m-0">{gasLimitLabel(preview.path === "registry" ? preview.executeGas : null)}</dd>
        <dt className="text-base-content/60">Expires</dt>
        <dd className="m-0">{expiryLabel(PROPOSAL_EXPIRY_SECONDS)}</dd>
        {council && (
          <>
            <dt className="text-base-content/60">Who approves</dt>
            <dd className="m-0">{approverLabel(preview.kind, council)}</dd>
          </>
        )}
      </dl>

      <details>
        <summary className="cursor-pointer text-[13px] font-semibold text-base-content/60">Calldata</summary>
        <p className="mt-2 mb-0 font-mono text-xs break-all text-base-content/60">
          {preview.path === "registry" ? preview.calldata : "none — native transaction body"}
        </p>
      </details>
    </section>
  );
};
