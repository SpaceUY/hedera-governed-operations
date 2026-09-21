/**
 * Validated operator configuration for the setup script.
 * Mirrors what `services/hederaClient.ts` reads, but fails fast and never allows mainnet:
 * the script funds accounts and creates entities, so it must only ever run against testnet.
 */
export type SetupNetwork = "testnet";

export type SetupEnv = {
  operatorId: string;
  operatorPrivateKey: string;
  network: SetupNetwork;
};

type EnvSource = Record<string, string | undefined>;

const DEFAULT_NETWORK: SetupNetwork = "testnet";

function requireValue(source: EnvSource, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required in packages/nextjs/.env`);
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
    network: readNetwork(source),
  };
}
