import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { isHederaChainId } from "../utils/hederaChains";
import { recordHederaContractId } from "../utils/recordHederaContractId";

const CONTRACT = "AcmeVaultV2";

/// Deploys the next version of the vault as a plain contract: on chain, but not live. Pointing the
/// proxy at it is a proposal the council has to approve, which is the operation this template is
/// built to demonstrate. Having it deployed is what gives the demo something to vote on.
const deployAcmeVaultV2: DeployFunction = async function (hre) {
  const { deployer } = await hre.getNamedAccounts();
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));

  const deployment = await hre.deployments.deploy(CONTRACT, {
    from: deployer,
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });

  if (!isHederaChainId(chainId) || !deployment.address) {
    return;
  }

  const hederaContractId = await recordHederaContractId(hre, CONTRACT, deployment.address, chainId);
  console.log(`Resolved Hedera contract id: ${hederaContractId}`);
};

deployAcmeVaultV2.tags = [CONTRACT];
export default deployAcmeVaultV2;
