import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { CallTarget, GovernedExecutor } from "../typechain-types";

const NEW_VALUE = 42n;

/// Mirrors GovernedExecutor.ProposalState.
const PENDING = 0n;
const CANCELLED = 2n;

describe("GovernedExecutor", () => {
  let gov: HardhatEthersSigner;
  let proposer: HardhatEthersSigner;
  let otherProposer: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let executor: GovernedExecutor;
  let target: CallTarget;

  /// Registers a proposal calling `setValue(NEW_VALUE)` and returns its id.
  const proposeSetValue = async (): Promise<bigint> => {
    const data = target.interface.encodeFunctionData("setValue", [NEW_VALUE]);
    const id = await executor.connect(proposer).createProposal.staticCall(await target.getAddress(), data);
    await executor.connect(proposer).createProposal(await target.getAddress(), data);
    return id;
  };

  beforeEach(async () => {
    [gov, proposer, otherProposer, outsider] = await ethers.getSigners();
    executor = await (
      await ethers.getContractFactory("GovernedExecutor")
    ).deploy(gov.address, [proposer.address, otherProposer.address]);
    target = await (await ethers.getContractFactory("CallTarget")).deploy();
  });

  describe("roles", () => {
    it("lets an account with PROPOSER_ROLE create a proposal", async () => {
      await expect(executor.connect(proposer).createProposal(outsider.address, "0x"))
        .to.emit(executor, "ProposalCreated")
        .withArgs(0, proposer.address, outsider.address, "0x");

      expect(await executor.proposalCount()).to.equal(1);
    });

    it("rejects a proposal from an account without PROPOSER_ROLE", async () => {
      await expect(executor.connect(outsider).createProposal(outsider.address, "0x"))
        .to.be.revertedWithCustomError(executor, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, await executor.PROPOSER_ROLE());
    });

    it("lists the proposers granted at deployment", async () => {
      expect(await executor.getRoleMembers(await executor.PROPOSER_ROLE())).to.deep.equal([
        proposer.address,
        otherProposer.address,
      ]);
    });

    it("grants EXECUTOR_ROLE to the governance account and to nobody else", async () => {
      expect(await executor.getRoleMembers(await executor.EXECUTOR_ROLE())).to.deep.equal([gov.address]);
    });

    it("keeps the role admin on the contract itself, so roles only change through a proposal", async () => {
      const adminRole = await executor.DEFAULT_ADMIN_ROLE();

      expect(await executor.getRoleMembers(adminRole)).to.deep.equal([await executor.getAddress()]);
      await expect(
        executor.connect(gov).grantRole(await executor.PROPOSER_ROLE(), outsider.address),
      ).to.be.revertedWithCustomError(executor, "AccessControlUnauthorizedAccount");
    });
  });

  describe("execute", () => {
    it("runs the proposed call when the governance account executes it", async () => {
      const id = await proposeSetValue();

      await expect(executor.connect(gov).execute(id)).to.emit(executor, "Executed").withArgs(id, gov.address);

      expect(await target.value()).to.equal(NEW_VALUE);
    });

    it("reaches the target as the executor contract, not as the governance account", async () => {
      const id = await proposeSetValue();

      await executor.connect(gov).execute(id);

      expect(await target.lastCaller()).to.equal(await executor.getAddress());
    });

    it("rejects an execution from an account without EXECUTOR_ROLE", async () => {
      const id = await proposeSetValue();

      await expect(executor.connect(proposer).execute(id))
        .to.be.revertedWithCustomError(executor, "AccessControlUnauthorizedAccount")
        .withArgs(proposer.address, await executor.EXECUTOR_ROLE());
    });

    it("refuses to execute the same proposal twice", async () => {
      const id = await proposeSetValue();
      await executor.connect(gov).execute(id);

      await expect(executor.connect(gov).execute(id))
        .to.be.revertedWithCustomError(executor, "ProposalNotPending")
        .withArgs(id);
    });

    it("bubbles the target's revert and leaves the proposal pending", async () => {
      const data = target.interface.encodeFunctionData("boom");
      await executor.connect(proposer).createProposal(await target.getAddress(), data);

      await expect(executor.connect(gov).execute(0)).to.be.revertedWith("target failed");

      expect((await executor.proposal(0)).state).to.equal(PENDING);
    });
  });

  describe("cancel", () => {
    it("lets the proposer withdraw their own pending proposal", async () => {
      const id = await proposeSetValue();

      await expect(executor.connect(proposer).cancel(id)).to.emit(executor, "Cancelled").withArgs(id, proposer.address);

      expect((await executor.proposal(id)).state).to.equal(CANCELLED);
      await expect(executor.connect(gov).execute(id))
        .to.be.revertedWithCustomError(executor, "ProposalNotPending")
        .withArgs(id);
    });

    it("lets the governance account cancel any pending proposal", async () => {
      const id = await proposeSetValue();

      await executor.connect(gov).cancel(id);

      expect((await executor.proposal(id)).state).to.equal(CANCELLED);
    });

    it("refuses to let one proposer cancel another's proposal", async () => {
      const id = await proposeSetValue();

      await expect(executor.connect(otherProposer).cancel(id))
        .to.be.revertedWithCustomError(executor, "NotCancellable")
        .withArgs(id, otherProposer.address);
    });

    it("refuses to cancel a proposal that already ran", async () => {
      const id = await proposeSetValue();
      await executor.connect(gov).execute(id);

      await expect(executor.connect(proposer).cancel(id))
        .to.be.revertedWithCustomError(executor, "ProposalNotPending")
        .withArgs(id);
    });
  });

  describe("role changes", () => {
    it("adds a proposer through a proposal that targets the executor itself", async () => {
      const proposerRole = await executor.PROPOSER_ROLE();
      const data = executor.interface.encodeFunctionData("grantRole", [proposerRole, outsider.address]);
      await executor.connect(proposer).createProposal(await executor.getAddress(), data);

      await executor.connect(gov).execute(0);

      expect(await executor.hasRole(proposerRole, outsider.address)).to.equal(true);
    });
  });
});
