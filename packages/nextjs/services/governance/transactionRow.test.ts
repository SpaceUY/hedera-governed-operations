import { waitForTransactionRow } from "./transactionRow";
import { MirrorNodeError, type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
}));
// Poll without waiting, so the not-yet-indexed path runs at test speed.
vi.mock("~~/utils/scaffold-hbar/waitForMirrorIndexing", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/utils/scaffold-hbar/waitForMirrorIndexing")>()),
  MIRROR_INDEXING_RETRY_DELAYS_MS: [0, 0],
}));

const row = (name: string, result: string) => ({ name, result }) as unknown as MirrorTransaction;
const INPUT = { transactionId: "0.0.1@1.2", name: "SCHEDULESIGN", network: "testnet" } as const;

beforeEach(() => void vi.mocked(fetchTransaction).mockReset());

describe("waitForTransactionRow", () => {
  it("returns the row of the named type once Mirror lists it", async () => {
    vi.mocked(fetchTransaction)
      .mockRejectedValueOnce(new MirrorNodeError(404, "/api/v1/transactions/0.0.1-1-2", "not found"))
      .mockResolvedValueOnce([row("CONTRACTCALL", "SUCCESS"), row("SCHEDULESIGN", "SUCCESS")]);
    await expect(waitForTransactionRow(INPUT)).resolves.toMatchObject({ name: "SCHEDULESIGN", result: "SUCCESS" });
    expect(fetchTransaction).toHaveBeenCalledWith("0.0.1@1.2", { network: "testnet" });
  });

  it("answers null when the window runs out", async () => {
    vi.mocked(fetchTransaction).mockResolvedValue([row("CONTRACTCALL", "SUCCESS")]);
    await expect(waitForTransactionRow(INPUT)).resolves.toBeNull();
    expect(fetchTransaction).toHaveBeenCalledTimes(3);
  });
});
