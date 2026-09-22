/**
 * Validated operator configuration for the setup script.
 * Mirrors what `services/hederaClient.ts` reads, but fails fast and never allows mainnet:
 * the script funds accounts and creates entities, so it must only ever run against testnet.
 */
export type SetupNetwork = "testnet";

export type SetupEnv = {
  operatorId: string;
  operatorPrivateKey: string;
  councilAccountId: string;
  network: SetupNetwork;
};

type EnvSource = Record<string, string | undefined>;

const DEFAULT_NETWORK: SetupNetwork = "testnet";

function requireValue(source: EnvSource, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required in packages/nextjs/.env`);
  return value;
}

/**
 * The one member of the governance account's threshold key that a human holds. It cannot be
 * derived from the operator: the script signs with the operator, but the council member is
 * whatever wallet the person installing the template connects with.
 */
function readCouncilAccountId(source: EnvSource): string {
  const value = source.HEDERA_COUNCIL_ACCOUNT_ID?.trim();
  if (!value) {
    throw new Error(
      "HEDERA_COUNCIL_ACCOUNT_ID is required in packages/nextjs/.env: the governance account needs your own " +
        "Hedera account as one of its three keys, and it is the account you will approve proposals with",
    );
  }
  return value;
}

function readNetwork(source: EnvSource): SetupNetwork {
  const value = (source.HEDERA_NETWORK ?? DEFAULT_NETWORK).trim().toLowerCase();
  if (value === "mainnet") throw new Error("HEDERA_NETWORK=mainnet: the setup script refuses to run against mainnet");
  if (value !== DEFAULT_NETWORK) throw new Error(`HEDERA_NETWORK=${value} is not supported; use ${DEFAULT_NETWORK}`);
  return value;
}

export function readSetupEnv(source: EnvSource): SetupEnv {
  return {
    operatorId: requireValue(source, "HEDERA_OPERATOR_ID"),
    operatorPrivateKey: requireValue(source, "HEDERA_OPERATOR_PRIVATE_KEY"),
    councilAccountId: readCouncilAccountId(source),
    network: readNetwork(source),
  };
}
