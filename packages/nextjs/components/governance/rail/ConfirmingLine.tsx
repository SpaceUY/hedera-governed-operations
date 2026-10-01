import { CONFIRMING_COPY } from "./copy";

/**
 * Says a signature is on its way, with DaisyUI's moving dots; under reduced motion only the words
 * stay. A span, so the same line fits inside a card's button and in the detail.
 */
export const ConfirmingLine = () => (
  <span role="status" className="flex items-center gap-2 text-sm text-base-content/70">
    <span aria-hidden="true" className="loading loading-dots loading-xs motion-reduce:hidden" />
    {CONFIRMING_COPY.line}
  </span>
);
