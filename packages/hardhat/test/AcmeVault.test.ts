import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BaseContract } from "ethers";
// The deploy script builds the proxy through hardhat-deploy's UUPS mode, which uses this prebuilt
// artifact. Tests deploy the same bytecode so they exercise the proxy that reaches testnet.
import ERC1967Proxy from "hardhat-deploy/extendedArtifacts/ERC1967Proxy.json";
import type { AcmeVault, AcmeVaultV2, GovernedExecutor } from "../typechain-types";

/// Amounts are written in tinybars, the unit `msg.value` arrives in on Hedera. The vault never
/// interprets them, so the local EVM's 18 decimals and Hedera's 8 give the same result.
const DEPOSIT = ethers.parseUnits("3", 8);
const WITHDRAWAL_LIMIT = ethers.parseUnits("1", 8);

describe("AcmeVault", () => {
  let gov: HardhatEthersSigner;
  let proposer: HardhatEthersSigner;
  let depositor: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let executor: GovernedExecutor;
  let vault: AcmeVault;
  let implementation: AcmeVault;
  let proxyAddress: string;

  /// Deploys an implementation behind a fresh ERC1967 proxy already initialized against `trusted`.
  const deployBehindProxy = async (trusted: string): Promise<[AcmeVault, AcmeVault]> => {
    const impl = (await (await ethers.getContractFactory("AcmeVault")).deploy()) as AcmeVault;
    const initData = impl.interface.encodeFunctionData("initialize", [trusted]);
    const proxyFactory = await ethers.getContractFactory(ERC1967Proxy.abi, ERC1967Proxy.bytecode);
    const proxy = await proxyFactory.deploy(await impl.getAddress(), initData);
    return [impl.attach(await proxy.getAddress()) as AcmeVault, impl];
  };

  /// Runs `upgradeToAndCall` on the proxy the way governance does it: a registered proposal that the
  /// account holding the threshold key executes, so the call reaches the vault as the executor.
  const upgradeThroughProposal = async (newImplementation: BaseContract, initCall: string): Promise<void> => {
    const callData = vault.interface.encodeFunctionData("upgradeToAndCall", [
      await newImplementation.getAddress(),
      initCall,
    ]);
    const id = await executor.connect(proposer).createProposal.staticCall(proxyAddress, callData);
    await executor.connect(proposer).createProposal(proxyAddress, callData);
    await executor.connect(gov).execute(id);
  };

  const deployVersionTwo = async (): Promise<AcmeVaultV2> =>
    (await (await ethers.getContractFactory("AcmeVaultV2")).deploy()) as AcmeVaultV2;

  beforeEach(async () => {
    [gov, proposer, depositor, outsider] = await ethers.getSigners();
    executor = await (await ethers.getContractFactory("GovernedExecutor")).deploy(gov.address, [proposer.address]);
    [vault, implementation] = await deployBehindProxy(await executor.getAddress());
    proxyAddress = await vault.getAddress();
  });

  describe("initialization", () => {
    it("records the executor that is allowed to upgrade it", async () => {
      expect(await vault.executor()).to.equal(await executor.getAddress());
    });

    it("refuses a second initialization of the proxy", async () => {
      await expect(vault.initialize(outsider.address)).to.be.revertedWithCustomError(vault, "InvalidInitialization");
    });

    it("leaves the implementation contract itself uninitialized", async () => {
      await expect(implementation.initialize(outsider.address)).to.be.revertedWithCustomError(
        implementation,
        "InvalidInitialization",
      );
    });

    /// Nothing rejects the zero address, and the executor has no setter, so a vault initialized
    /// this way takes deposits that no upgrade can ever unlock. It is the cost of the binding
    /// being permanent, and the deploy script is what keeps it from happening.
    it("accepts the zero address as the executor", async () => {
      const [stranded] = await deployBehindProxy(ethers.ZeroAddress);

      expect(await stranded.executor()).to.equal(ethers.ZeroAddress);
    });

    it("leaves a vault initialized against the zero address unupgradeable by anyone", async () => {
      const [stranded] = await deployBehindProxy(ethers.ZeroAddress);
      const v2Implementation = await deployVersionTwo();

      await expect(stranded.connect(gov).upgradeToAndCall(await v2Implementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(stranded, "NotExecutor")
        .withArgs(gov.address);
    });
  });

  describe("deposits", () => {
    it("credits the depositor and the running total", async () => {
      await expect(vault.connect(depositor).deposit({ value: DEPOSIT }))
        .to.emit(vault, "Deposited")
        .withArgs(depositor.address, DEPOSIT);

      expect(await vault.balanceOf(depositor.address)).to.equal(DEPOSIT);
      expect(await vault.totalDeposits()).to.equal(DEPOSIT);
    });

    it("rejects a deposit of zero", async () => {
      await expect(vault.connect(depositor).deposit({ value: 0 })).to.be.revertedWithCustomError(vault, "ZeroDeposit");
    });

    it("rejects a plain transfer that carries no call data", async () => {
      await expect(depositor.sendTransaction({ to: proxyAddress, value: DEPOSIT })).to.be.reverted;
    });
  });

  describe("governed upgrade", () => {
    it("upgrades to v2 through an approved proposal, preserving the balances", async () => {
      await vault.connect(depositor).deposit({ value: DEPOSIT });
      const v2Implementation = await deployVersionTwo();

      await upgradeThroughProposal(
        v2Implementation,
        v2Implementation.interface.encodeFunctionData("initV2", [WITHDRAWAL_LIMIT]),
      );

      const upgraded = v2Implementation.attach(proxyAddress) as AcmeVaultV2;
      expect(await upgraded.balanceOf(depositor.address)).to.equal(DEPOSIT);
      expect(await upgraded.totalDeposits()).to.equal(DEPOSIT);
      expect(await upgraded.executor()).to.equal(await executor.getAddress());
      expect(await upgraded.withdrawalLimit()).to.equal(WITHDRAWAL_LIMIT);
    });

    it("rejects an upgrade from an account that is not the executor", async () => {
      const v2Implementation = await deployVersionTwo();

      await expect(vault.connect(outsider).upgradeToAndCall(await v2Implementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(vault, "NotExecutor")
        .withArgs(outsider.address);
    });

    it("rejects an upgrade driven by the governance account outside a proposal", async () => {
      const v2Implementation = await deployVersionTwo();

      await expect(vault.connect(gov).upgradeToAndCall(await v2Implementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(vault, "NotExecutor")
        .withArgs(gov.address);
    });

    it("refuses to run initV2 a second time", async () => {
      const v2Implementation = await deployVersionTwo();
      const initCall = v2Implementation.interface.encodeFunctionData("initV2", [WITHDRAWAL_LIMIT]);
      await upgradeThroughProposal(v2Implementation, initCall);

      const upgraded = v2Implementation.attach(proxyAddress) as AcmeVaultV2;
      await expect(upgraded.initV2(WITHDRAWAL_LIMIT)).to.be.revertedWithCustomError(upgraded, "InvalidInitialization");
    });
  });

  describe("withdrawals unlocked by v2", () => {
    let upgraded: AcmeVaultV2;

    beforeEach(async () => {
      await vault.connect(depositor).deposit({ value: DEPOSIT });
      const v2Implementation = await deployVersionTwo();
      await upgradeThroughProposal(
        v2Implementation,
        v2Implementation.interface.encodeFunctionData("initV2", [WITHDRAWAL_LIMIT]),
      );
      upgraded = v2Implementation.attach(proxyAddress) as AcmeVaultV2;
    });

    it("pays out a withdrawal within the limit and debits the balance", async () => {
      await expect(upgraded.connect(depositor).withdraw(WITHDRAWAL_LIMIT)).to.changeEtherBalance(
        depositor,
        WITHDRAWAL_LIMIT,
      );

      expect(await upgraded.balanceOf(depositor.address)).to.equal(DEPOSIT - WITHDRAWAL_LIMIT);
      expect(await upgraded.totalDeposits()).to.equal(DEPOSIT - WITHDRAWAL_LIMIT);
    });

    it("rejects a withdrawal above the per-call limit", async () => {
      await expect(upgraded.connect(depositor).withdraw(WITHDRAWAL_LIMIT + 1n))
        .to.be.revertedWithCustomError(upgraded, "WithdrawalTooLarge")
        .withArgs(WITHDRAWAL_LIMIT + 1n, WITHDRAWAL_LIMIT);
    });

    it("logs a withdrawal of zero, which is within every limit and every balance", async () => {
      await expect(upgraded.connect(depositor).withdraw(0))
        .to.emit(upgraded, "Withdrawn")
        .withArgs(depositor.address, 0);
    });

    it("leaves the balance untouched after a withdrawal of zero", async () => {
      await upgraded.connect(depositor).withdraw(0);

      expect(await upgraded.balanceOf(depositor.address)).to.equal(DEPOSIT);
    });

    it("rejects a withdrawal from an account with no balance", async () => {
      await expect(upgraded.connect(outsider).withdraw(WITHDRAWAL_LIMIT))
        .to.be.revertedWithCustomError(upgraded, "InsufficientBalance")
        .withArgs(WITHDRAWAL_LIMIT, 0);
    });
  });
});
