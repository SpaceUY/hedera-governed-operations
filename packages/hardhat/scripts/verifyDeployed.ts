import { readFileSync } from "node:fs";
import { join } from "node:path";
import hre from "hardhat";
import type { Deployment } from "hardhat-deploy/types";

import { HEDERA_NETWORK_BY_CHAIN_ID } from "../utils/hederaChains";

/**
 * Verify contracts deployed with hardhat-deploy on the active network.
 * Reads addresses from `deployments/<network>/` and submits the build to Sourcify.
 *
 * This talks to the Sourcify v2 API directly instead of going through
 * `@nomicfoundation/hardhat-verify`: that plugin's Sourcify client still calls the v1
 * endpoints, which Sourcify has retired and which now answer with an HTML 404 page.
 *
 * Everything the API asks for comes from the deployment record itself rather than from the
 * project's current artifacts. That is what makes a proxy verifiable: `AcmeVault` is deployed as
 * an `ERC1967Proxy` compiled by hardhat-deploy with its own solc, so resolving the build by
 * contract name would submit this repo's `AcmeVault` sources against the proxy's address, where
 * they cannot match. The record knows what was actually compiled.
 */

const SOURCIFY_API_URL = process.env.SOURCIFY_API_URL ?? "https://sourcify.dev/server";

/// Sourcify reports "verified already, and this job found nothing better" as a completed job error.
const ALREADY_VERIFIED = "already_verified";

const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 2_000;

type VerificationJob = {
  isJobCompleted: boolean;
  error?: { customCode?: string; message?: string };
  contract?: { match?: string | null };
};

/// The subset of the Solidity metadata the record embeds as a JSON string.
type ContractMetadata = {
  compiler: { version: string };
  settings: { compilationTarget: Record<string, string> };
};

/// What the v2 API needs to verify one address, assembled from one deployment record.
type Submission = {
  name: string;
  address: string;
  /// `path/to/File.sol:ContractName`, the entry solc compiled this deployment from.
  contractIdentifier: string;
  compilerVersion: string;
  stdJsonInput: unknown;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function solcInputsDir(): string {
  return join(hre.config.paths.deployments, hre.deployments.getNetworkName(), "solcInputs");
}

/// Returns undefined for a record this project cannot rebuild, with the reason printed.
function readSubmission(name: string, deployment: Deployment): Submission | undefined {
  if (!deployment.metadata || !deployment.solcInputHash) {
    console.log(`Skipping ${name} — its deployment record carries no compiler metadata.`);
    return undefined;
  }

  const { compiler, settings } = JSON.parse(deployment.metadata) as ContractMetadata;
  const [entry] = Object.entries(settings.compilationTarget);
  if (!entry) {
    console.log(`Skipping ${name} — its metadata names no compilation target.`);
    return undefined;
  }

  const inputPath = join(solcInputsDir(), `${deployment.solcInputHash}.json`);
  let stdJsonInput: unknown;
  try {
    stdJsonInput = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    console.log(`Skipping ${name} — ${inputPath} is missing, so its sources cannot be rebuilt.`);
    return undefined;
  }

  const [sourcePath, contractName] = entry;
  return {
    name,
    address: deployment.address,
    contractIdentifier: `${sourcePath}:${contractName}`,
    compilerVersion: compiler.version,
    stdJsonInput,
  };
}

/**
 * One submission per address. A proxy deployment is recorded three times — under the contract's
 * name, `_Proxy` and `_Implementation` — and the first two are the same address and the same build.
 */
function submissions(deployments: Record<string, Deployment>): Submission[] {
  const byAddress = new Map<string, Submission>();

  for (const name of Object.keys(deployments).sort()) {
    const address = deployments[name].address.toLowerCase();
    if (byAddress.has(address)) {
      console.log(`Skipping ${name} — same address as ${byAddress.get(address)?.name}.`);
      continue;
    }

    const submission = readSubmission(name, deployments[name]);
    if (submission) byAddress.set(address, submission);
  }

  return [...byAddress.values()];
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
async function verifyOnSourcify(submission: Submission, chainId: number): Promise<boolean> {
  const { name, address, contractIdentifier, compilerVersion, stdJsonInput } = submission;

  const response = await fetch(`${SOURCIFY_API_URL}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stdJsonInput, compilerVersion, contractIdentifier }),
  });

  const body = (await response.json()) as { verificationId?: string; customCode?: string; message?: string };

  if (body.customCode === ALREADY_VERIFIED) {
    console.log(`${name} is already verified.`);
    return true;
  }
  if (response.status !== 202 || !body.verificationId) {
    console.error(`${name} was rejected by Sourcify: ${body.message ?? response.status}`);
    return false;
  }

  const job = await pollVerificationJob(body.verificationId);

  // A rerun submits a job that completes with this code instead of a match, so it is a success.
  if (job.error?.customCode === ALREADY_VERIFIED) {
    console.log(`${name} is already verified.`);
    return true;
  }
  if (!job.contract?.match) {
    console.error(`${name} did not verify: ${job.error?.message ?? "no match"}`);
    return false;
  }

  console.log(`${name} verified (${job.contract.match}).`);
  return true;
}

async function main() {
  const all = await hre.deployments.all();
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));
  const hederaNetwork = HEDERA_NETWORK_BY_CHAIN_ID[chainId];

  if (Object.keys(all).length === 0) {
    throw new Error(
      `No deployments found for "${hre.network.name}". Run \`yarn hardhat:deploy --network ${hre.network.name}\` first.`,
    );
  }

  const pending = submissions(all);
  if (pending.length === 0) {
    throw new Error(
      `No verifiable deployments on "${hre.network.name}". Deploy a contract or remove stale records under deployments/.`,
    );
  }

  let verified = 0;
  for (const submission of pending) {
    console.log(`\nVerifying ${submission.name} at ${submission.address} as ${submission.contractIdentifier}...`);

    if (await verifyOnSourcify(submission, chainId)) {
      verified++;
      if (hederaNetwork) {
        console.log(`HashScan: https://hashscan.io/${hederaNetwork}/contract/${submission.address}`);
      }
    }
  }

  if (verified < pending.length) {
    throw new Error(`${pending.length - verified} of ${pending.length} contracts failed verification.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
