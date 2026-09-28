/// What the adapter does with a swap it is handed: who it accepts one from, that the HBAR paid
/// matches the amount on record, the parameters it passes on and the event it leaves behind. It runs
/// on the local EVM against `MockSwapRouter`.
///
/// **It says nothing about SaucerSwap.** There is no HTS on the local EVM, and HTS is the only part
/// of this path that has ever failed: the swap these tests passed on reverted on testnet at every
/// gas limit it was given, because the pool's output transfer had to associate the token on the
/// recipient and ran out of gas doing it. A green run here is not evidence that a swap works, and no
/// gas number from here belongs in `PROPOSAL_TYPES`. That is what
/// `packages/nextjs/services/governance/treasurySwap.integration.test.ts` is for.
import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { MockSwapRouter, SaucerSwapAdapter } from "../typechain-types";

/// Amounts are in the smallest unit of each token, the way the contract sees them: HBAR reaches a
/// contract in tinybars (8 decimals) and this pool's output token has 6.
const AMOUNT_IN = 200_000_000n;
const AMOUNT_OUT = 4_100_000n;
const FLOOR = 3_900_000n;
const FEE = 3000n;
const DEADLINE = 2_000_000_000n;

/// Slippage protection is the floor alone; the router's own price limit stays off.
const NO_PRICE_LIMIT = 0n;

describe("SaucerSwapAdapter", () => {
  let executor: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let adapter: SaucerSwapAdapter;
  let router: MockSwapRouter;
  let whbar: string;
  let tokenOut: string;

  /// The swap a council approves: HBAR out of the treasury, output straight to the treasury account.
  const swap = (overrides?: { value?: bigint; amountIn?: bigint }) =>
    adapter
      .connect(executor)
      .swapExactHbarForToken(tokenOut, FEE, treasury.address, overrides?.amountIn ?? AMOUNT_IN, FLOOR, DEADLINE, {
        value: overrides?.value ?? AMOUNT_IN,
      });

  beforeEach(async () => {
    [executor, outsider, treasury] = await ethers.getSigners();
    router = await (await ethers.getContractFactory("MockSwapRouter")).deploy();
    await router.setAmountOut(AMOUNT_OUT);

    // Stand-ins for the WHBAR and output token addresses; the adapter only forwards them.
    whbar = ethers.getAddress("0x0000000000000000000000000000000000003ad2");
    tokenOut = ethers.getAddress("0x0000000000000000000000000000000000001549");

    adapter = await (
      await ethers.getContractFactory("SaucerSwapAdapter")
    ).deploy(executor.address, await router.getAddress(), whbar);
  });

  describe("wiring", () => {
    it("records the executor it accepts swaps from", async () => {
      expect(await adapter.executor()).to.equal(executor.address);
    });

    it("records the router it swaps through", async () => {
      expect(await adapter.router()).to.equal(await router.getAddress());
    });

    it("records the WHBAR token the router quotes HBAR as", async () => {
      expect(await adapter.whbar()).to.equal(whbar);
    });
  });

  describe("authority", () => {
    it("rejects a swap from an account that is not the executor", async () => {
      await expect(
        adapter
          .connect(outsider)
          .swapExactHbarForToken(tokenOut, FEE, treasury.address, AMOUNT_IN, FLOOR, DEADLINE, { value: AMOUNT_IN }),
      )
        .to.be.revertedWithCustomError(adapter, "NotExecutor")
        .withArgs(outsider.address);
    });

    it("leaves the router untouched when the caller is not the executor", async () => {
      await expect(
        adapter
          .connect(outsider)
          .swapExactHbarForToken(tokenOut, FEE, treasury.address, AMOUNT_IN, FLOOR, DEADLINE, { value: AMOUNT_IN }),
      ).to.be.reverted;

      expect(await router.callCount()).to.equal(0);
    });
  });

  describe("the amount is what the council approved", () => {
    /// `amountIn` travels in the proposal's calldata and the HBAR travels as the scheduled
    /// transaction's payable amount. They are two different places, so the adapter refuses to swap
    /// unless they agree: that check is what ties the amount moved to the proposal on record.
    it("rejects a swap paid less than the amount its proposal names", async () => {
      await expect(swap({ value: AMOUNT_IN - 1n }))
        .to.be.revertedWithCustomError(adapter, "ValueMismatch")
        .withArgs(AMOUNT_IN - 1n, AMOUNT_IN);
    });

    it("rejects a swap paid more than the amount its proposal names", async () => {
      await expect(swap({ value: AMOUNT_IN + 1n }))
        .to.be.revertedWithCustomError(adapter, "ValueMismatch")
        .withArgs(AMOUNT_IN + 1n, AMOUNT_IN);
    });

    it("pays the whole amount to the router", async () => {
      await swap();

      expect(await router.lastValue()).to.equal(AMOUNT_IN);
    });
  });

  describe("the swap it asks the router for", () => {
    it("passes the approved swap through unchanged, with WHBAR as the input token", async () => {
      await swap();

      expect(await router.lastParams()).to.deep.equal([
        whbar,
        tokenOut,
        FEE,
        treasury.address,
        DEADLINE,
        AMOUNT_IN,
        FLOOR,
        NO_PRICE_LIMIT,
      ]);
    });

    it("returns the amount the router reported", async () => {
      expect(
        await adapter
          .connect(executor)
          .swapExactHbarForToken.staticCall(tokenOut, FEE, treasury.address, AMOUNT_IN, FLOOR, DEADLINE, {
            value: AMOUNT_IN,
          }),
      ).to.equal(AMOUNT_OUT);
    });

    it("records the completed swap in an event", async () => {
      await expect(swap()).to.emit(adapter, "TreasurySwap").withArgs(tokenOut, treasury.address, AMOUNT_IN, AMOUNT_OUT);
    });
  });

  describe("custody", () => {
    it("keeps no HBAR of its own after a swap", async () => {
      await swap();

      expect(await ethers.provider.getBalance(await adapter.getAddress())).to.equal(0);
    });

    it("refuses a plain HBAR transfer, having no way to account for it", async () => {
      await expect(executor.sendTransaction({ to: await adapter.getAddress(), value: AMOUNT_IN })).to.be.reverted;
    });
  });

  describe("when the router refuses the swap", () => {
    it("bubbles the router's revert when the pool cannot meet the floor", async () => {
      await router.setRevertReason("Too little received");

      await expect(swap()).to.be.revertedWith("Too little received");
    });

    it("bubbles the router's revert once the deadline has passed", async () => {
      await router.setRevertReason("Transaction too old");

      await expect(swap()).to.be.revertedWith("Transaction too old");
    });

    it("moves no HBAR when the router reverts", async () => {
      await router.setRevertReason("Too little received");

      await expect(swap()).to.be.reverted;

      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
    });
  });
});
