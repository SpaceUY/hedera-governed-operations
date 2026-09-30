import { KEY_B, MAP_SNAPSHOT, pendingTransferTo } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { remoteSignatureNotice } from "./remoteSignatureNotice";
import { describe, expect, it } from "vitest";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";

const TRANSFER = pendingTransferTo("0.0.7000");
const WORLD: GovernanceSnapshot = {
  council: MAP_SNAPSHOT.council,
  proposers: MAP_SNAPSHOT.proposers,
  proposals: [TRANSFER],
  unreachableProposers: [],
  treasury: null,
  nodeStates: { vaultImplementation: null, tokenPaused: null },
};
const APPROVAL: ApprovedEvent = {
  kind: "approved",
  scheduleId: TRANSFER.schedule.schedule_id,
  memberKey: KEY_B,
  at: "1790000000.000000000",
};

describe("remoteSignatureNotice", () => {
  it("names the seat as the map does and the proposal as the rail does", () => {
    expect(remoteSignatureNotice(APPROVAL, { map: composeMap(MAP_SNAPSHOT), world: WORLD })).toBe(
      "0.0.4102 signed “Transfer 40 ℏ to 0.0.7000 out of 0.0.4000” from their own device. Nobody on this screen pressed anything — the poll saw it.",
    );
  });

  it("falls back to words when the map has no name or the read no proposal", () => {
    expect(remoteSignatureNotice(APPROVAL, { map: null, world: null })).toMatch(
      /^A council member signed “0\.0\.9000”/,
    );
  });
});
