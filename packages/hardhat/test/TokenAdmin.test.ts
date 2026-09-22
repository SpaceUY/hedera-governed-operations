import { expect } from "chai";
import { ethers } from "hardhat";
import { setCode } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { MockHTS, TokenAdmin } from "../typechain-types";

/// The HTS system contract's address. Fixed by the protocol, the same on every Hedera network, and
/// hardcoded in `TokenAdmin` — so the test puts the mock's code at that address instead of pointing
/// the contract somewhere else.
const HTS = "0x0000000000000000000000000000000000000167";

/// Response codes from Hedera's `ResponseCodeEnum`, as the system contract returns them.
const SUCCESS = 22n;
const TOKEN_NOT_ASSOCIATED_TO_ACCOUNT = 184n;
const TOKEN_HAS_NO_PAUSE_KEY = 217n;

type HtsOperation = "pauseToken" | "unpauseToken" | "freezeToken" | "unfreezeToken";

/// Stand-ins for a token and an account address; the contract only forwards them.
const TOKEN = ethers.getAddress("0x0000000000000000000000000000000000a2d11a");
const ACCOUNT = ethers.getAddress("0x0000000000000000000000000000000000a2d119");

describe("TokenAdmin", () => {
  let executor: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let admin: TokenAdmin;
  let hts: MockHTS;

  beforeEach(async () => {
    [executor, outsider] = await ethers.getSigners();

    const mock = await (await ethers.getContractFactory("MockHTS")).deploy();
    await setCode(HTS, await ethers.provider.getCode(await mock.getAddress()));
    hts = mock.attach(HTS) as MockHTS;
    await hts.setResponseCode(SUCCESS);

    admin = await (await ethers.getContractFactory("TokenAdmin")).deploy(executor.address);
  });

  describe("wiring", () => {
    it("records the executor it accepts operations from", async () => {
      expect(await admin.executor()).to.equal(executor.address);
    });
  });

  describe("authority", () => {
    it("rejects an operation from an account that is not the executor", async () => {
      await expect(admin.connect(outsider).pause(TOKEN))
        .to.be.revertedWithCustomError(admin, "NotExecutor")
        .withArgs(outsider.address);
    });

    it("leaves the token untouched when the caller is not the executor", async () => {
      await expect(admin.connect(outsider).freeze(TOKEN, ACCOUNT)).to.be.reverted;

      expect(await hts.callCount()).to.equal(0);
    });
  });

  describe("the operation it asks HTS for", () => {
    /// What HTS was asked to do, not what `TokenAdmin` was called: this is where pausing and
    /// unpausing would be indistinguishable if they were ever wired to the wrong operation.
    const htsSelector = (operation: HtsOperation) => hts.interface.getFunction(operation).selector;

    it("pauses the token it was given", async () => {
      await admin.connect(executor).pause(TOKEN);

      expect(await hts.lastCall()).to.deep.equal([htsSelector("pauseToken"), TOKEN, ethers.ZeroAddress]);
    });

    it("unpauses the token it was given", async () => {
      await admin.connect(executor).unpause(TOKEN);

      expect(await hts.lastCall()).to.deep.equal([htsSelector("unpauseToken"), TOKEN, ethers.ZeroAddress]);
    });

    /// Freezing acts on a token/account relationship, not on the token, so the account travels with it.
    it("freezes the account it was given, for that token", async () => {
      await admin.connect(executor).freeze(TOKEN, ACCOUNT);

      expect(await hts.lastCall()).to.deep.equal([htsSelector("freezeToken"), TOKEN, ACCOUNT]);
    });

    it("unfreezes the account it was given, for that token", async () => {
      await admin.connect(executor).unfreeze(TOKEN, ACCOUNT);

      expect(await hts.lastCall()).to.deep.equal([htsSelector("unfreezeToken"), TOKEN, ACCOUNT]);
    });
  });

  describe("records what it did", () => {
    it("records a paused token", async () => {
      await expect(admin.connect(executor).pause(TOKEN)).to.emit(admin, "TokenPaused").withArgs(TOKEN);
    });

    it("records an unpaused token", async () => {
      await expect(admin.connect(executor).unpause(TOKEN)).to.emit(admin, "TokenUnpaused").withArgs(TOKEN);
    });

    it("records a frozen account", async () => {
      await expect(admin.connect(executor).freeze(TOKEN, ACCOUNT))
        .to.emit(admin, "AccountFrozen")
        .withArgs(TOKEN, ACCOUNT);
    });

    it("records an unfrozen account", async () => {
      await expect(admin.connect(executor).unfreeze(TOKEN, ACCOUNT))
        .to.emit(admin, "AccountUnfrozen")
        .withArgs(TOKEN, ACCOUNT);
    });
  });

  /// HTS answers with a response code instead of reverting, so a contract that ignores it would let
  /// a refused operation look like a successful one: the proposal would be marked executed and the
  /// scheduled transaction that carried the council's approval would be spent on nothing. Reverting
  /// leaves the proposal pending and reschedulable, and carries the code out to the caller.
  describe("when HTS refuses the operation", () => {
    it("reverts with the code HTS answered", async () => {
      await hts.setResponseCode(TOKEN_NOT_ASSOCIATED_TO_ACCOUNT);

      await expect(admin.connect(executor).freeze(TOKEN, ACCOUNT))
        .to.be.revertedWithCustomError(admin, "HtsRejected")
        .withArgs(TOKEN_NOT_ASSOCIATED_TO_ACCOUNT);
    });

    it("reverts a pause the token has no key for", async () => {
      await hts.setResponseCode(TOKEN_HAS_NO_PAUSE_KEY);

      await expect(admin.connect(executor).pause(TOKEN))
        .to.be.revertedWithCustomError(admin, "HtsRejected")
        .withArgs(TOKEN_HAS_NO_PAUSE_KEY);
    });
  });
});
