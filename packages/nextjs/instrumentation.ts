/**
 * Runs once when the server starts. Under `next dev` it compiles the governance routes in the
 * background, so the first click on Settings or New proposal does not wait seconds for a compile.
 * It is not awaited: the server only starts listening once `register()` has returned.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  const { DEV_WARMUP_PATHS, warmDevRoutes } = await import("~~/services/devWarmup");
  void warmDevRoutes(`http://localhost:${process.env.PORT ?? 3000}`, DEV_WARMUP_PATHS, {
    fetch: url => fetch(url),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log: line => console.log(line),
  });
}
