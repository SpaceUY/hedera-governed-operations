/** A context for the preview kinds' tests: a 2-of-3 council, the vault's next release, one token the app has read. */
import type { PreviewContext } from "./previewKind";

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
