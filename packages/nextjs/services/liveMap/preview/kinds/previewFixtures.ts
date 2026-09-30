/** A context for the preview kinds' tests: a 2-of-3 council, the vault's next release, one token the app has read. */
import type { PreviewContext, SketchContext } from "./previewKind";
import { governanceEntities } from "~~/services/liveMap/model/graphEntities";

export const [SEAT_A, SEAT_B, SEAT_C, SEAT_D] = ["YWxpY2U=", "Ym9i", "Y2Fyb2w=", "ZGF2ZQ=="];
export const VAULT = "0x3f806946439c3521eeD7d740c3f84E09888C0419";
export const NEXT_RELEASE = "0x0000000000000000000000000000000000A2D434";
export const KNOWN_TOKEN = "0.0.6000";
export const GOVERNANCE = "0.0.4000";
export const SUPPLIER = "0.0.7000";

export const PREVIEW_CONTEXT: PreviewContext = {
  council: { threshold: 2, memberKeys: [SEAT_A, SEAT_B, SEAT_C] },
  vaultReleaseOf: implementation => (implementation.toLowerCase() === NEXT_RELEASE.toLowerCase() ? "next" : null),
  tokenOf: tokenId => (tokenId === KNOWN_TOKEN ? { symbol: "GOVD", decimals: 2 } : null),
};

export const VAULT_ID = "0.0.5001";
export const TOKEN_ADMIN_ID = "0.0.5002";
/** Deployed through the relay with no native id resolved yet, so the configuration names it by address. */
export const ADAPTER = "0x5aF0000000000000000000000000000000000003";

/** What a kind picked before its form is filled can name: the configured contracts, and the agent's key (seat D). */
export const SKETCH_CONTEXT: SketchContext = {
  governanceAccountId: GOVERNANCE,
  entities: governanceEntities({
    vault: { address: VAULT, hederaContractId: VAULT_ID },
    tokenAdmin: { address: "0x5aF0000000000000000000000000000000000002", hederaContractId: TOKEN_ADMIN_ID },
    swapAdapter: { address: ADAPTER },
    tokenId: KNOWN_TOKEN,
    routerId: "0.0.1414040",
  }),
  agentSeat: SEAT_D,
};
