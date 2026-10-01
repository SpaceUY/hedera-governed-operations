import { DEV_WARMUP_PATHS, DEV_WARMUP_RETRY_DELAYS_MS, type DevWarmupDeps, warmDevRoutes } from "./devWarmup";
import { describe, expect, it, vi } from "vitest";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";

describe("DEV_WARMUP_PATHS", () => {
  it("names every governance route", () => {
    expect(DEV_WARMUP_PATHS).toEqual([
      GOVERNANCE_ROUTES.home,
      GOVERNANCE_ROUTES.settings,
      GOVERNANCE_ROUTES.newProposal,
      GOVERNANCE_ROUTES.proposal("0.0.1"),
    ]);
  });
});

function depsWith(fetch: DevWarmupDeps["fetch"]): DevWarmupDeps {
  return { fetch, sleep: vi.fn().mockResolvedValue(undefined), log: vi.fn() };
}

const refused = () => Promise.reject(new TypeError("fetch failed"));

describe("warmDevRoutes", () => {
  it("requests every path once, in order", async () => {
    const deps = depsWith(vi.fn().mockResolvedValue({ status: 200 }));

    await warmDevRoutes("http://localhost:3010", ["/", "/settings"], deps);

    expect(vi.mocked(deps.fetch).mock.calls).toEqual([["http://localhost:3010/"], ["http://localhost:3010/settings"]]);
  });

  it("retries while the server is not listening yet", async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(refused)
      .mockImplementationOnce(refused)
      .mockResolvedValue({ status: 200 });
    const deps = depsWith(fetch);

    await warmDevRoutes("http://localhost:3000", ["/"], deps);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledTimes(2);
  });

  it("keeps warming the next path when one answers with an error", async () => {
    const deps = depsWith(vi.fn().mockResolvedValueOnce({ status: 500 }).mockResolvedValue({ status: 200 }));

    await warmDevRoutes("http://localhost:3000", ["/settings", "/governance/new"], deps);

    expect(deps.fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.log).mock.calls[0][0]).toMatch(/^\[warmup\] \/settings 500 in/);
  });

  it("gives up without throwing when the server never answers", async () => {
    const deps = depsWith(vi.fn().mockImplementation(refused));

    await expect(warmDevRoutes("http://localhost:3000", ["/", "/settings"], deps)).resolves.toBeUndefined();

    expect(deps.fetch).toHaveBeenCalledTimes(DEV_WARMUP_RETRY_DELAYS_MS.length + 1);
    expect(deps.log).toHaveBeenCalledWith("[warmup] /: the server never answered, skipping the rest");
  });
});
