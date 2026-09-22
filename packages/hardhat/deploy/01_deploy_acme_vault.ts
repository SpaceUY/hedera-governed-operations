import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const CONTRACT = "AcmeVault";

/// Deploys the vault behind an ERC1967 proxy, so its code can be replaced without moving the funds
/// it holds. The executor is fixed at initialization and is the only account the vault accepts an
/// upgrade from.
///
/// Re-running this after editing `AcmeVault.sol` makes hardhat-deploy attempt the upgrade itself,
/// as the deployer, and the vault rejects it. That is the intended outcome: upgrading is an act of
/// governance, not of deployment. A new version ships as its own implementation (see 02) and
/// reaches the proxy only through an approved proposal.
const deployAcmeVault: DeployFunction = async function (hre) {
  const { deployer } = await hre.getNamedAccounts();
  const executor = await hre.deployments.get("GovernedExecutor");

  await hre.deployments.deploy(CONTRACT, {
    from: deployer,
    proxy: {
      proxyContract: "UUPS",
      execute: { init: { methodName: "initialize", args: [executor.address] } },
    },
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployAcmeVault.tags = [CONTRACT];
deployAcmeVault.dependencies = ["GovernedExecutor"];
export default deployAcmeVault;
