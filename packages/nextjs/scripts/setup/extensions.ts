/**
 * Extension points for product-specific setup. The core script (`yarn setup`) creates what any
 * direction needs: an HCS topic, funded ECDSA demo accounts and their USDC association. Hooks
 * below run after the core reconcile, in order, with the final state. They are intentionally
 * no-ops: implement one when the product direction needs extra on-chain fixtures, keep it
 * idempotent (check before creating, like `reconcile`) and persist any new ids through `ctx.saveState`.
 */
import type { SetupEnv } from "./env";
import type { MirrorLookups } from "./reconcile";
import type { SetupState } from "./state";
import type { Client } from "@hiero-ledger/sdk";

export type SetupContext = {
  env: SetupEnv;
  /** Operator client; already configured and closed by the entry point after the hooks run. */
  client: Client;
  /** Mirror Node reads, for verifying ids before re-creating anything. */
  lookups: MirrorLookups;
  /** State after the core reconcile (topic, demo accounts with keys). */
  state: SetupState;
  /** Persist a new state; the entry point writes the app env from whatever the hooks leave here. */
  saveState(next: SetupState): void;
};

/**
 * Governed-operations direction: threshold-key governance account, scheduled transactions,
 * signer set for the demo. Not implemented.
 */
export async function setupGovernance(ctx: SetupContext): Promise<void> {
  void ctx;
}

/**
 * Merchant-rails direction: merchant account settings, DEX allowances, price feed fixtures.
 * Not implemented.
 */
export async function setupMerchant(ctx: SetupContext): Promise<void> {
  void ctx;
}
