import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { HEDERA_MAINNET_CHAIN_ID, HEDERA_TESTNET_CHAIN_ID } from "../utils/hederaChains";
import { recordHederaContractId } from "../utils/recordHederaContractId";

const CONTRACT = "SaucerSwapAdapter";

/// SaucerSwap V2's deployments, in the notation Hedera uses for them — the same ids the app's
/// `services/swap` configuration carries, written the same way so the two can be compared by eye.
/// Checked against Mirror Node; the testnet pair is the one this template's swap runs against.
const SAUCERSWAP: Record<number, { swapRouter: string; whbarToken: string }> = {
  [HEDERA_TESTNET_CHAIN_ID]: { swapRouter: "0.0.1414040", whbarToken: "0.0.15058" },
  [HEDERA_MAINNET_CHAIN_ID]: { swapRouter: "0.0.3949434", whbarToken: "0.0.1456986" },
};

/// A Hedera entity with no EVM alias of its own is addressed by its entity number, zero-padded to
/// twenty bytes. Both the router and WHBAR predate the JSON-RPC relay, so this is how the EVM
/// reaches them.
const toEvmAddress = (hederaId: string): string => {
  const [, , entityNumber] = hederaId.split(".");
  return `0x${BigInt(entityNumber).toString(16).padStart(40, "0")}`;
};

/// Deploys the adapter that lets an approved proposal swap treasury HBAR on SaucerSwap. It holds
/// nothing and takes its authority from the executor's address, fixed here and without a setter:
/// redeploying the executor means redeploying this too.
const deploySaucerSwapAdapter: DeployFunction = async function (hre) {
  const { deployer } = await hre.getNamedAccounts();
  const chainId = Number(await hre.network.provider.send("eth_chainId", []));
  const saucerSwap = SAUCERSWAP[chainId];

  // A local chain has no SaucerSwap to point at. The adapter's behaviour is covered by its tests
  // against a mock router; what needs a real chain is the swap itself.
  if (!saucerSwap) {
    console.log(`Skipping ${CONTRACT}: SaucerSwap is not deployed on chain id ${chainId}.`);
    return;
  }

  const executor = await hre.deployments.get("GovernedExecutor");

  const deployment = await hre.deployments.deploy(CONTRACT, {
    from: deployer,
    args: [executor.address, toEvmAddress(saucerSwap.swapRouter), toEvmAddress(saucerSwap.whbarToken)],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });

  if (!deployment.address) {
    return;
  }

  // Past the SaucerSwap lookup above this is always Hedera, so no chain check is needed here.
  const hederaContractId = await recordHederaContractId(hre, CONTRACT, deployment.address, chainId);
  console.log(`Resolved Hedera contract id: ${hederaContractId}`);
};

deploySaucerSwapAdapter.tags = [CONTRACT];
deploySaucerSwapAdapter.dependencies = ["GovernedExecutor"];
export default deploySaucerSwapAdapter;
