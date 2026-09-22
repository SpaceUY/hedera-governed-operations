import * as fs from "fs";
import * as path from "path";

import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { resolveHederaContractId } from "./resolveHederaContractId";

/**
 * Look up the native Hedera contract id for a freshly deployed contract and keep it in the
 * deployment record, where `generateTsAbis` picks it up for the app. Anything the SDK addresses
 * natively needs it: a scheduled `ContractExecuteTransaction` targets the contract id, and so does
 * a token key that points at a contract.
 */
export async function recordHederaContractId(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  evmAddress: string,
  chainId: number,
): Promise<string> {
  const hederaContractId = await resolveHederaContractId(evmAddress, chainId);

  const deploymentPath = path.join(hre.config.paths.deployments, hre.network.name, `${contractName}.json`);
  const deploymentJson = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as Record<string, unknown>;
  deploymentJson.hederaContractId = hederaContractId;
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deploymentJson, null, 2)}\n`);

  return hederaContractId;
}
