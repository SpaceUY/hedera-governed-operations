import { announceRemoteSignature } from "./announceRemoteSignature";
import { KEY_B, MAP_SNAPSHOT, pendingTransferTo } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";
import { notification } from "~~/utils/scaffold-hbar/notification";

vi.mock("~~/utils/scaffold-hbar/notification", () => ({ notification: { info: vi.fn() } }));

const TRANSFER = pendingTransferTo("0.0.7000");
const WORLD: GovernanceSnapshot = {
  council: MAP_SNAPSHOT.council,
  proposers: MAP_SNAPSHOT.proposers,
  proposals: [TRANSFER],
  unreachableProposers: [],
  treasury: null,
};
const APPROVAL: ApprovedEvent = {
  kind: "approved",
  scheduleId: TRANSFER.schedule.schedule_id,
  memberKey: KEY_B,
  at: "1790000000.000000000",
};

beforeEach(() => vi.mocked(notification.info).mockReset());

describe("announceRemoteSignature", () => {
  it("names the seat as the map does and the proposal as the rail does", () => {
    announceRemoteSignature(APPROVAL, { map: composeMap(MAP_SNAPSHOT), world: WORLD });
    expect(vi.mocked(notification.info).mock.calls[0][0]).toBe(
      "0.0.4102 signed “Transfer 40 ℏ to 0.0.7000 out of 0.0.4000” elsewhere. Nobody pressed anything here: the map read it from the ledger.",
    );
  });

  it("falls back to words when the map has no name or the read no proposal", () => {
    announceRemoteSignature(APPROVAL, { map: null, world: null });
    expect(vi.mocked(notification.info).mock.calls[0][0]).toMatch(/^A council member signed “0\.0\.9000”/);
  });
});
