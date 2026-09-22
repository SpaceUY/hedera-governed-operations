import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { recordHederaContractId } from "../utils/recordHederaContractId";

const CONTRACT = "TokenAdmin";
const HEDERA_CHAIN_IDS = new Set([295, 296]);

/// Deploys the contract that administers an HTS token on the council's behalf. It takes its
/// authority from the executor's address, fixed here and without a setter.
///
/// What makes this deployment permanent is on the token side: a token's pause and freeze keys are
/// set to this contract's id, and a token created without an admin key can never have them changed
/// again. Deploy this before creating the token, point the token's keys at the id printed below,
/// and treat redeploying it as creating a new token — see docs/ARCHITECTURE.md.
const deployTokenAdmin: DeployFunction = async function (hre) {
  const { deployer } = await hre.getNamedAccounts();
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));
  const executor = await hre.deployments.get("GovernedExecutor");

  const deployment = await hre.deployments.deploy(CONTRACT, {
    from: deployer,
    args: [executor.address],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });

  if (!HEDERA_CHAIN_IDS.has(chainId) || !deployment.address) {
    return;
  }

  // A token key that points at a contract carries the native contract id, not the EVM address.
  const hederaContractId = await recordHederaContractId(hre, CONTRACT, deployment.address, chainId);
  console.log(`Set the token's pause and freeze keys to contract id: ${hederaContractId}`);
};

deployTokenAdmin.tags = [CONTRACT];
deployTokenAdmin.dependencies = ["GovernedExecutor"];
export default deployTokenAdmin;
