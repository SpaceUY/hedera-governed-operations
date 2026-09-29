import { CO_SIGNING_AGENT_KIND } from "./coSigningAgent/kind";
import { TOKEN_ADMIN_KIND } from "./tokenAdmin/kind";
import { TREASURY_SWAP_KIND } from "./treasurySwap/kind";
import { TREASURY_TRANSFER_KIND } from "./treasuryTransfer/kind";
import { VAULT_UPGRADE_KIND } from "./vaultUpgrade/kind";
import type { WizardKindEntry } from "./wizardKind";
import type { WizardKind } from "./wizardKinds";

/** Every kind the wizard offers, one line each; the kind's form, targets and copy live in its own folder. */
export const WIZARD_KIND_ENTRIES: Record<WizardKind, WizardKindEntry> = {
  upgrade: VAULT_UPGRADE_KIND,
  treasurySwap: TREASURY_SWAP_KIND,
  tokenAdmin: TOKEN_ADMIN_KIND,
  treasuryTransfer: TREASURY_TRANSFER_KIND,
  // The one council rotation the wizard offers: seating the co-signing agent.
  councilRotation: CO_SIGNING_AGENT_KIND,
};
