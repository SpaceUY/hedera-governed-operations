import hre from "hardhat";

/**
 * Verify contracts deployed with hardhat-deploy on the active network.
 * Reads addresses from `deployments/<network>/` and submits the build to Sourcify.
 *
 * This talks to the Sourcify v2 API directly instead of going through
 * `@nomicfoundation/hardhat-verify`: that plugin's Sourcify client still calls the v1
 * endpoints, which Sourcify has retired and which now answer with an HTML 404 page.
 * Everything the API needs — the standard JSON input and the exact compiler version —
 * is already in the build info Hardhat writes at compile time.
 *
 * Skips stale deployment records that no longer have compiled artifacts in this repo.
 */

const SOURCIFY_API_URL = process.env.SOURCIFY_API_URL ?? "https://sourcify.dev/server";
const HEDERA_NETWORK_BY_CHAIN_ID: Record<number, string> = { 295: "mainnet", 296: "testnet" };

/// Sourcify reports "verified already, and this job found nothing better" as a completed job error.
const ALREADY_VERIFIED = "already_verified";

const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 2_000;

type VerificationJob = {
  isJobCompleted: boolean;
  error?: { customCode?: string; message?: string };
  contract?: { match?: string | null };
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/// Sourcify identifies a contract as `path/to/File.sol:ContractName`, which is Hardhat's
/// fully qualified name. Resolving it by name also fails loudly when two sources share one.
async function fullyQualifiedName(contractName: string): Promise<string> {
  const names = await hre.artifacts.getAllFullyQualifiedNames();
  const matches = names.filter(name => name.endsWith(`:${contractName}`));

  if (matches.length === 0) {
    throw new Error(`No artifact for ${contractName}.`);
  }
  if (matches.length > 1) {
    throw new Error(`${contractName} is ambiguous: ${matches.join(", ")}.`);
  }

  return matches[0];
}

async function pollVerificationJob(verificationId: string): Promise<VerificationJob> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${SOURCIFY_API_URL}/v2/verify/${verificationId}`);
    const job = (await response.json()) as VerificationJob;

    if (job.isJobCompleted) {
      return job;
    }
    await delay(POLL_DELAY_MS);
  }

  throw new Error(`Sourcify did not finish job ${verificationId} in time.`);
}

/// Returns true when the contract ends up verified, including when it already was.
async function verifyOnSourcify(contractName: string, address: string, chainId: number): Promise<boolean> {
  const name = await fullyQualifiedName(contractName);
  const buildInfo = await hre.artifacts.getBuildInfo(name);

  if (!buildInfo) {
    throw new Error(`No build info for ${name}. Run \`yarn hardhat:compile\` first.`);
  }

  const response = await fetch(`${SOURCIFY_API_URL}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: buildInfo.input,
      compilerVersion: buildInfo.solcLongVersion,
      contractIdentifier: name,
    }),
  });

  const body = (await response.json()) as { verificationId?: string; customCode?: string; message?: string };

  if (body.customCode === ALREADY_VERIFIED) {
    console.log(`${contractName} is already verified.`);
    return true;
  }
  if (response.status !== 202 || !body.verificationId) {
    console.error(`${contractName} was rejected by Sourcify: ${body.message ?? response.status}`);
    return false;
  }

  const job = await pollVerificationJob(body.verificationId);

  // A rerun submits a job that completes with this code instead of a match, so it is a success.
  if (job.error?.customCode === ALREADY_VERIFIED) {
    console.log(`${contractName} is already verified.`);
    return true;
  }
  if (!job.contract?.match) {
    console.error(`${contractName} did not verify: ${job.error?.message ?? "no match"}`);
    return false;
  }

  console.log(`${contractName} verified (${job.contract.match}).`);
  return true;
}

async function main() {
  const all = await hre.deployments.all();
  const names = Object.keys(all).sort();
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));

  if (names.length === 0) {
    throw new Error(
      `No deployments found for "${hre.network.name}". Run \`yarn hardhat:deploy --network ${hre.network.name}\` first.`,
    );
  }

  let verified = 0;
  let attempted = 0;

  for (const name of names) {
    try {
      hre.artifacts.readArtifactSync(name);
    } catch {
      console.log(`Skipping ${name} — no artifact in this project (stale deployment record).`);
      continue;
    }

    const { address } = all[name];
    console.log(`\nVerifying ${name} at ${address}...`);
    attempted++;

    if (await verifyOnSourcify(name, address, chainId)) {
      verified++;
      const hederaNetwork = HEDERA_NETWORK_BY_CHAIN_ID[chainId];
      if (hederaNetwork) {
        console.log(`HashScan: https://hashscan.io/${hederaNetwork}/contract/${address}`);
      }
    }
  }

  if (attempted === 0) {
    throw new Error(
      `No verifiable deployments on "${hre.network.name}". Deploy a contract or remove stale records under deployments/.`,
    );
  }
  if (verified < attempted) {
    throw new Error(`${attempted - verified} of ${attempted} contracts failed verification.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
