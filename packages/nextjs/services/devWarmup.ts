/**
 * The routes `next dev` compiles at boot instead of on the first click: `GOVERNANCE_ROUTES`, spelled
 * out because `instrumentation.ts` loads this file, and importing the app's config there pulls the
 * wallet hooks into the server's startup build and breaks every page. The test keeps the two in step.
 * Any schedule id compiles the proposal route; the page reads the proposal in the browser.
 */
export const DEV_WARMUP_PATHS: readonly string[] = ["/", "/settings", "/governance/new", "/governance/0.0.1"];

/** `register()` runs before the server listens, which takes a few seconds more; these add up to 15 s. */
export const DEV_WARMUP_RETRY_DELAYS_MS: readonly number[] = Array.from({ length: 30 }, () => 500);

export type DevWarmupDeps = {
  fetch: (url: string) => Promise<{ status: number }>;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

/** One request, retried while the connection is refused; `null` once the retries are spent. */
async function requestWhenListening(url: string, deps: DevWarmupDeps): Promise<number | null> {
  for (let attempt = 0; attempt <= DEV_WARMUP_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { status } = await deps.fetch(url);
      return status;
    } catch {
      if (attempt < DEV_WARMUP_RETRY_DELAYS_MS.length) await deps.sleep(DEV_WARMUP_RETRY_DELAYS_MS[attempt]);
    }
  }
  return null;
}

/**
 * Requests each path once, in order, so the dev server compiles them one after another. It never
 * throws: a route that fails to compile is logged and the next one is still warmed.
 */
export async function warmDevRoutes(baseUrl: string, paths: readonly string[], deps: DevWarmupDeps): Promise<void> {
  for (const path of paths) {
    const startedAt = Date.now();
    const status = await requestWhenListening(`${baseUrl}${path}`, deps);
    if (status === null) {
      deps.log(`[warmup] ${path}: the server never answered, skipping the rest`);
      return;
    }
    deps.log(`[warmup] ${path} ${status} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  }
}
