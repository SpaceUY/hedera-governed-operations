import { DEMO_INSTANCE_COPY } from "~~/components/governance/rail/copy";

/**
 * Tells a fresh clone that the screens read the template's published instance (`DEMO_INSTANCE`), and
 * how to get its own. Gone as soon as `yarn setup` has written the app's ids.
 */
export const DemoInstanceNotice = () => (
  <div role="note" className="alert alert-info mx-6 mb-0 mt-5 flex flex-col items-start gap-1 text-sm">
    <p className="m-0 font-bold">{DEMO_INSTANCE_COPY.title}</p>
    <p className="m-0">
      {DEMO_INSTANCE_COPY.body} <code>{DEMO_INSTANCE_COPY.command}</code>.
    </p>
  </div>
);
