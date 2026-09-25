/**
 * Shown in place of a governance page when the deployment or the `yarn setup` ids are missing, so a
 * freshly scaffolded app renders instead of crashing. The message is the config error itself, which
 * already names the command to run.
 */
export const SetupNotice = ({ error }: { error: unknown }) => (
  <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
    <div role="alert" className="alert alert-warning flex flex-col items-start">
      <h1 className="text-lg font-bold">Governance is not set up yet</h1>
      <p className="text-sm">
        {error instanceof Error ? error.message : "The governance configuration could not be read."}
      </p>
    </div>
  </div>
);
