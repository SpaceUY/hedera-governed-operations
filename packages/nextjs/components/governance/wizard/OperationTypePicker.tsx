import { type ComponentType, useId } from "react";
import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import { ArrowRightIcon, ArrowUpIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { PROPOSAL_FAMILY_HEADINGS, PROPOSAL_KIND_COPY } from "~~/components/governance/wizard/copy";

/** The kinds that have a form. Adding one is a form component and an entry here. */
export const WIZARD_KINDS = ["upgrade", "treasurySwap", "treasuryTransfer"] as const satisfies readonly ProposalKind[];

export type WizardKind = (typeof WIZARD_KINDS)[number];

const KIND_ICONS: Record<WizardKind, ComponentType<{ className?: string }>> = {
  upgrade: ArrowUpIcon,
  treasurySwap: ArrowsRightLeftIcon,
  treasuryTransfer: ArrowRightIcon,
};

type OperationTypePickerProps = { value: WizardKind; onChange: (kind: WizardKind) => void };

type KindGroupProps = OperationTypePickerProps & { legend: string; kinds: WizardKind[]; name: string };

/**
 * Native radios sharing one `name` across both groups, so the browser gives the picker radio-group
 * semantics and keyboard behaviour (one tab stop, arrows move the choice) without any ARIA wiring.
 */
const KindGroup = ({ legend, kinds, name, value, onChange }: KindGroupProps) => (
  <fieldset className="flex flex-col gap-1.5">
    <legend className="mb-1.5 text-sm font-semibold text-base-content/60">{legend}</legend>
    {kinds.map(kind => {
      const Icon = KIND_ICONS[kind];
      return (
        <label
          key={kind}
          className="flex cursor-pointer items-center gap-2 rounded-box border border-base-300 bg-base-200 px-3 py-2.5 text-sm font-semibold has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-not-allowed has-disabled:opacity-60"
        >
          <input
            type="radio"
            name={name}
            value={kind}
            checked={value === kind}
            onChange={() => onChange(kind)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={`size-7 grid place-items-center bg-base-content/10 ${
              isContractProposalKind(kind) ? "rounded-lg" : "rounded-full"
            }`}
          >
            <Icon className="size-3.5" />
          </span>
          {PROPOSAL_KIND_COPY[kind].title}
          <small className="ml-auto text-xs font-medium text-base-content/60">{PROPOSAL_KIND_COPY[kind].hint}</small>
        </label>
      );
    })}
  </fieldset>
);

export const OperationTypePicker = ({ value, onChange }: OperationTypePickerProps) => {
  const name = useId();
  return (
    <div className="flex flex-col gap-4">
      <KindGroup
        legend={PROPOSAL_FAMILY_HEADINGS.contract}
        kinds={WIZARD_KINDS.filter(kind => isContractProposalKind(kind))}
        name={name}
        value={value}
        onChange={onChange}
      />
      <KindGroup
        legend={PROPOSAL_FAMILY_HEADINGS.native}
        kinds={WIZARD_KINDS.filter(kind => !isContractProposalKind(kind))}
        name={name}
        value={value}
        onChange={onChange}
      />
    </div>
  );
};
