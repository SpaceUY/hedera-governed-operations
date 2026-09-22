import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { isHederaChainId } from "../utils/hederaChains";
import { recordHederaContractId } from "../utils/recordHederaContractId";

const CONTRACT = "GovernedExecutor";

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
  const isHedera = isHederaChainId(chainId);

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
  const hederaContractId = await recordHederaContractId(hre, CONTRACT, deployment.address, chainId);
  console.log(`Resolved Hedera contract id: ${hederaContractId}`);
};

deployGovernedExecutor.tags = [CONTRACT];
export default deployGovernedExecutor;
