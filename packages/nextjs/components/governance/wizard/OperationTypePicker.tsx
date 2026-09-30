import { useId } from "react";
import type { CouncilKey } from "@sh/core/governance/council";
import { isContractProposalKind } from "@sh/core/governance/proposalTypes";
import { PROPOSAL_FAMILY_HEADINGS, PROPOSAL_KIND_COPY } from "~~/components/governance/wizard/copy";
import { WIZARD_KIND_ENTRIES } from "~~/components/governance/wizard/kinds/registry";
import { WIZARD_KINDS, type WizardKind } from "~~/components/governance/wizard/kinds/wizardKinds";

type OperationTypePickerProps = {
  value: WizardKind;
  onChange: (kind: WizardKind) => void;
  /** The current council once it is read, for a kind whose hint counts its seats. */
  council: CouncilKey | undefined;
};

type KindGroupProps = OperationTypePickerProps & { legend: string; kinds: WizardKind[]; name: string };

/**
 * Native radios sharing one `name` across both groups, so the browser gives the picker radio-group
 * semantics and keyboard behaviour (one tab stop, arrows move the choice) without any ARIA wiring.
 */
const hintOf = (kind: WizardKind, council: CouncilKey | undefined): string => {
  const { hint } = WIZARD_KIND_ENTRIES[kind];
  return hint && council ? hint(council) : PROPOSAL_KIND_COPY[kind].hint;
};

const KindGroup = ({ legend, kinds, name, value, onChange, council }: KindGroupProps) => (
  <fieldset className="flex flex-col gap-1.5">
    <legend className="mb-1.5 text-sm font-semibold text-base-content/60">{legend}</legend>
    {kinds.map(kind => {
      const Icon = WIZARD_KIND_ENTRIES[kind].icon;
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
          {WIZARD_KIND_ENTRIES[kind].title ?? PROPOSAL_KIND_COPY[kind].title}
          <small className="ml-auto text-xs font-medium text-base-content/60">{hintOf(kind, council)}</small>
        </label>
      );
    })}
  </fieldset>
);

export const OperationTypePicker = ({ value, onChange, council }: OperationTypePickerProps) => {
  const name = useId();
  return (
    <div className="flex flex-col gap-4">
      <KindGroup
        legend={PROPOSAL_FAMILY_HEADINGS.contract}
        kinds={WIZARD_KINDS.filter(kind => isContractProposalKind(kind))}
        name={name}
        value={value}
        onChange={onChange}
        council={council}
      />
      <KindGroup
        legend={PROPOSAL_FAMILY_HEADINGS.native}
        kinds={WIZARD_KINDS.filter(kind => !isContractProposalKind(kind))}
        name={name}
        value={value}
        onChange={onChange}
        council={council}
      />
    </div>
  );
};
