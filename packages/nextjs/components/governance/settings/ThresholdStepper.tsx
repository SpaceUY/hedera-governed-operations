import { useId } from "react";
import { SETTINGS_COPY } from "./copy";

export type ThresholdStepperProps = {
  threshold: number;
  seats: number;
  /** The proposed council's rule, such as "2-of-3". */
  rule: string;
  onStep: (by: 1 | -1) => void;
};

/** How many of the ticked seats must sign, moved one at a time within the seats. */
export const ThresholdStepper = ({ threshold, seats, rule, onStep }: ThresholdStepperProps) => {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span id={labelId} className="text-sm font-semibold">
        {SETTINGS_COPY.composer.thresholdLabel}
      </span>
      <div role="group" aria-labelledby={labelId} className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-circle btn-outline btn-sm"
          aria-label={SETTINGS_COPY.composer.fewer}
          disabled={threshold <= 1}
          onClick={() => onStep(-1)}
        >
          −
        </button>
        <output aria-live="polite" className="min-w-16 text-center text-xl font-bold tabular-nums">
          {rule}
        </output>
        <button
          type="button"
          className="btn btn-circle btn-outline btn-sm"
          aria-label={SETTINGS_COPY.composer.more}
          disabled={threshold >= seats}
          onClick={() => onStep(1)}
        >
          +
        </button>
      </div>
    </div>
  );
};
