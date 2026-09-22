import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

const CONTRACT = "AcmeVaultV2";

/// Deploys the next version of the vault as a plain contract: on chain, but not live. Pointing the
/// proxy at it is a proposal the council has to approve, which is the operation this template is
/// built to demonstrate. Having it deployed is what gives the demo something to vote on.
const deployAcmeVaultV2: DeployFunction = async function (hre) {
  const { deployer } = await hre.getNamedAccounts();

  await hre.deployments.deploy(CONTRACT, {
    from: deployer,
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployAcmeVaultV2.tags = [CONTRACT];
export default deployAcmeVaultV2;
