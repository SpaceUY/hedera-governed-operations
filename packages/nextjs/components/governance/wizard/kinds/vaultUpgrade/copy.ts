/** What the vault upgrade says when it cannot be offered on this network. */
export const VAULT_UPGRADE_COPY = {
  targetMissing:
    "The vault's next implementation is not deployed on this network, so a vault upgrade cannot be proposed yet. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; paying a supplier works without it.",
} as const;
