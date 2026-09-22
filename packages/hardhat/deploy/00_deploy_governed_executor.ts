import * as fs from "fs";
import * as path from "path";

import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { resolveHederaContractId } from "../utils/resolveHederaContractId";

const CONTRACT = "GovernedExecutor";
const HEDERA_CHAIN_IDS = new Set([295, 296]);

/// The governance account must be the one holding the threshold key: it is the only `EXECUTOR_ROLE`
/// member, and giving that role to a single-signer account would skip the m-of-n approval entirely.
/// On a local chain there is no such account, so the deployer stands in for it.
const readConstructorArgs = (deployer: string, isHedera: boolean): [string, string[]] => {
  const governanceAccount = process.env.GOVERNANCE_ACCOUNT_ADDRESS?.trim();
  const initialProposers =
    process.env.INITIAL_PROPOSERS?.split(",")
      .map(address => address.trim())
      .filter(Boolean) ?? [];

  if (!isHedera) {
    return [governanceAccount || deployer, initialProposers.length > 0 ? initialProposers : [deployer]];
  }

  if (!governanceAccount) {
    throw new Error("Set GOVERNANCE_ACCOUNT_ADDRESS to the EVM address of the account holding the threshold key.");
  }
  if (initialProposers.length === 0) {
    throw new Error("Set INITIAL_PROPOSERS to a comma-separated list of EVM addresses allowed to propose.");
  }

  return [governanceAccount, initialProposers];
};

const deployGovernedExecutor: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));
  const isHedera = HEDERA_CHAIN_IDS.has(chainId);

  const [governanceAccount, initialProposers] = readConstructorArgs(deployer, isHedera);

  const deployment = await hre.deployments.deploy(CONTRACT, {
    from: deployer,
    args: [governanceAccount, initialProposers],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });

  if (!isHedera || !deployment.address) {
    return;
  }

  // Scheduled transactions target the native contract id, not the EVM address.
  const hederaContractId = await resolveHederaContractId(deployment.address, chainId);
  const deploymentPath = path.join(hre.config.paths.deployments, hre.network.name, `${CONTRACT}.json`);
  const deploymentJson = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as Record<string, unknown>;
  deploymentJson.hederaContractId = hederaContractId;
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deploymentJson, null, 2)}\n`);
  console.log(`Resolved Hedera contract id: ${hederaContractId}`);
};

deployGovernedExecutor.tags = [CONTRACT];
export default deployGovernedExecutor;
