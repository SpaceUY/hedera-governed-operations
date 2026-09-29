import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { isHederaChainId } from "../utils/hederaChains";
import { recordHederaContractId } from "../utils/recordHederaContractId";

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
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));
  const executor = await hre.deployments.get("GovernedExecutor");

  const deployment = await hre.deployments.deploy(CONTRACT, {
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

  if (!isHederaChainId(chainId) || !deployment.address) {
    return;
  }

  // The proxy's own id: an upgrade is a scheduled call, and a scheduled call targets the contract
  // id rather than the EVM address. Without it `resolveGovernanceConfig` refuses to start and every
  // governance route shows the setup notice instead.
  const hederaContractId = await recordHederaContractId(hre, CONTRACT, deployment.address, chainId);
  console.log(`Resolved Hedera contract id: ${hederaContractId}`);
};

deployAcmeVault.tags = [CONTRACT];
deployAcmeVault.dependencies = ["GovernedExecutor"];
export default deployAcmeVault;
