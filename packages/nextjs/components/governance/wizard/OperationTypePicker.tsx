import type { ComponentType } from "react";
import { ArrowRightIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
import { PROPOSAL_FAMILY_HEADINGS, PROPOSAL_KIND_COPY } from "~~/services/governance/proposalLabels";
import { type ProposalKind, isContractProposalKind } from "~~/services/governance/proposalTypes";

/** The kinds that have a form. Adding one is a form component and an entry here. */
export const WIZARD_KINDS = ["upgrade", "treasuryTransfer"] as const satisfies readonly ProposalKind[];

export type WizardKind = (typeof WIZARD_KINDS)[number];

const KIND_ICONS: Record<WizardKind, ComponentType<{ className?: string }>> = {
  upgrade: ArrowUpIcon,
  treasuryTransfer: ArrowRightIcon,
};

type OperationTypePickerProps = { value: WizardKind; onChange: (kind: WizardKind) => void };

type KindGroupProps = OperationTypePickerProps & { heading: string; kinds: WizardKind[] };

const KindGroup = ({ heading, kinds, value, onChange }: KindGroupProps) => (
  <div className="flex flex-col gap-1.5">
    <p className="m-0 text-[13px] font-semibold text-base-content/60">{heading}</p>
    <div role="group" aria-label={heading} className="flex flex-col gap-1.5">
      {kinds.map(kind => {
        const selected = value === kind;
        const Icon = KIND_ICONS[kind];
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(kind)}
            className={`btn btn-block justify-start h-auto min-h-0 py-2.5 px-3 rounded-box bg-base-200 font-semibold text-[13.5px] ${
              selected ? "border-primary bg-primary/10" : "border-base-300"
            }`}
          >
            <span
              className={`size-7 grid place-items-center bg-base-content/10 ${
                isContractProposalKind(kind) ? "rounded-lg" : "rounded-full"
              }`}
            >
              <Icon className="size-3.5" />
            </span>
            {PROPOSAL_KIND_COPY[kind].title}
            <small className="ml-auto text-[12.5px] font-medium text-base-content/60">
              {PROPOSAL_KIND_COPY[kind].hint}
            </small>
          </button>
        );
      })}
    </div>
  </div>
);

export const OperationTypePicker = ({ value, onChange }: OperationTypePickerProps) => (
  <>
    <KindGroup
      heading={PROPOSAL_FAMILY_HEADINGS.contract}
      kinds={WIZARD_KINDS.filter(kind => isContractProposalKind(kind))}
      value={value}
      onChange={onChange}
    />
    <KindGroup
      heading={PROPOSAL_FAMILY_HEADINGS.native}
      kinds={WIZARD_KINDS.filter(kind => !isContractProposalKind(kind))}
      value={value}
      onChange={onChange}
    />
  </>
);
