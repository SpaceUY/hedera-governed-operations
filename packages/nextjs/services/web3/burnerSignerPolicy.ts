import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export const BURNER_SIGNER_ENABLE_ENV = "NEXT_PUBLIC_ENABLE_BURNER_SIGNER";

type BurnerAvailabilityInput = {
  network: HederaNetworkName;
  nodeEnv: string | undefined;
  enableFlag: string | undefined;
};

export type BurnerAvailability = { allowed: true } | { allowed: false; reason: string };

/**
 * The burner signs with a private key stored in the browser, so it is only allowed on testnet and,
 * in production builds, only when the app opts in explicitly.
 */
export function resolveBurnerAvailability({
  network,
  nodeEnv,
  enableFlag,
}: BurnerAvailabilityInput): BurnerAvailability {
  if (network !== "testnet") return { allowed: false, reason: "the test signer only runs on testnet" };
  if (nodeEnv === "production" && enableFlag !== "true") {
    return { allowed: false, reason: `${BURNER_SIGNER_ENABLE_ENV} is not "true" in a production build` };
  }
  return { allowed: true };
}
