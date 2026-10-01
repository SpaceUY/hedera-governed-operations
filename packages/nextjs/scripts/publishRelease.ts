/**
 * Publishes a release manifest to the HCS topic `yarn setup` created.
 *
 * This is the other half of the agent's upgrade check. At release time the pipeline records, on a
 * public topic, which implementation address belongs to which version and what the code deployed
 * there hashes to. An upgrade proposal can then be checked by anyone — the agent does it before
 * signing, and a human can repeat it from HashScan by reading the topic and comparing the hash
 * against `GET /contracts/{id}`.
 *
 * The hash is taken from what the Mirror Node reports as deployed, not from the local artifact. The
 * two differ — immutable variables and the metadata suffix are decided at deploy time — and the
 * check compares against the network, so the publisher has to as well or nothing would ever match.
 *
 * The operator signs the message because the operator is the topic's submit key, which is what makes
 * a manifest evidence rather than a claim anybody could have posted. In a real deployment this runs
 * as the release pipeline, and the submit key is whatever identity that pipeline holds.
 *
 *   yarn release:publish --contract AcmeVaultV2 --version v2.0.0
 *   yarn release:publish --contract AcmeVaultV2 --version v2.0.0 --implementation 0x… --commit abc1234
 *
 * `--implementation` defaults to the address `yarn hardhat:deploy` recorded for
 * `<contract>_Implementation`, or for `<contract>` when it was not deployed behind a proxy, and
 * `--commit` to `GITHUB_SHA` or the current HEAD.
 */
import { implementationFromDeployments } from "./release/implementation";
import { readSetupEnv } from "./setup/env";
import { Client, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { buildReleaseManifestMessage, hashRuntimeBytecode } from "@sh/core/governance/releaseManifest";
import { fetchContract } from "@sh/core/mirror";
import { config as loadDotenv } from "dotenv";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseOperatorKey } from "~~/services/operatorKey";

const PACKAGE_DIR = resolve(__dirname, "..");

type Args = {
  contract: string;
  version: string;
  implementation?: string;
  commit?: string;
  topicId?: string;
};

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag.startsWith("--")) throw new Error(`Expected a --flag, got ${flag}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} has no value`);
    values.set(flag.slice(2), value);
  }

  const contract = values.get("contract");
  const version = values.get("version");
  if (!contract || !version) {
    throw new Error("--contract and --version are required, e.g. --contract AcmeVaultV2 --version v2.0.0");
  }
  return {
    contract,
    version,
    implementation: values.get("implementation"),
    commit: values.get("commit"),
    topicId: values.get("topic"),
  };
}

function currentCommit(): string {
  const fromCi = process.env.GITHUB_SHA?.trim();
  if (fromCi) return fromCi;
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function requireTopicId(fromArgs: string | undefined): string {
  const topicId = fromArgs ?? process.env.NEXT_PUBLIC_RELEASE_TOPIC_ID?.trim();
  if (!topicId) {
    throw new Error(
      "No release topic. Run yarn setup, which creates it and writes NEXT_PUBLIC_RELEASE_TOPIC_ID to .env.local, " +
        "or pass --topic 0.0.x.",
    );
  }
  return topicId;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // The topic id is written by `yarn setup` into .env.local, and the operator that may write to it
  // lives in .env. dotenv never overwrites a variable already set, so .env.local goes first and wins,
  // as it does for Next.js.
  loadDotenv({ path: resolve(PACKAGE_DIR, ".env.local"), quiet: true });
  loadDotenv({ path: resolve(PACKAGE_DIR, ".env"), quiet: true });
  const env = readSetupEnv(process.env);
  const topicId = requireTopicId(args.topicId);
  // hardhat-deploy names the directory after the network, and this script only ever runs against
  // the one `yarn setup` is allowed to touch.
  const deploymentsDir = resolve(PACKAGE_DIR, "..", "hardhat", "deployments", "hederaTestnet");
  const implementation = args.implementation ?? implementationFromDeployments(args.contract, deploymentsDir);

  const contract = await fetchContract(implementation, { network: env.network });
  if (!contract.runtime_bytecode || contract.runtime_bytecode === "0x") {
    throw new Error(`${implementation} has no deployed code on ${env.network}: there is nothing to attest`);
  }

  const manifest = {
    version: args.version,
    contract: args.contract,
    implementation,
    bytecodeHash: hashRuntimeBytecode(contract.runtime_bytecode),
    commit: args.commit ?? currentCommit(),
    publishedAt: new Date().toISOString(),
  };

  const client = Client.forName(env.network).setOperator(env.operatorId, parseOperatorKey(env.operatorPrivateKey));
  try {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(buildReleaseManifestMessage(manifest))
      .execute(client);
    const receipt = await response.getReceipt(client);

    console.log(`\n  Published ${manifest.contract} ${manifest.version} to topic ${topicId}`);
    console.log(`    implementation  ${manifest.implementation}`);
    console.log(`    bytecode hash   ${manifest.bytecodeHash}`);
    console.log(`    commit          ${manifest.commit}`);
    console.log(`    sequence        ${receipt.topicSequenceNumber?.toString() ?? "?"}`);
    console.log(`\n  https://hashscan.io/${env.network}/topic/${topicId}\n`);
  } finally {
    client.close();
  }
}

main().catch((error: Error) => {
  console.error(`\n  ${error.message}\n`);
  process.exitCode = 1;
});
