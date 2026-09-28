// @vitest-environment node

/**
 * The treasury swap against the real SaucerSwap router on Hedera testnet, and the owner of
 * `PROPOSAL_TYPES.treasurySwap.executeGas`.
 *
 * **This suite spends.** It sells one HBAR of the governance account's balance and pays the gas of a
 * real contract call, which makes it the one integration suite here that is not free to run. It is
 * opt-in on the operator like the others and skips without it, so `yarn test` and CI never pay for it.
 *
 * It exists because the adapter's Hardhat tests cannot fail the way this path failed. They run
 * against `MockSwapRouter`, which has no HTS in it, and the swap they were green on reverted on
 * testnet at every gas limit it was given: the pool pays its output through the system contract at
 * `0x167`, and with the treasury unassociated that transfer spent the whole remaining limit on an
 * automatic association and returned `INSUFFICIENT_GAS`. Only the network can settle whether the real
 * router, the real pool and the real system contract finish inside the limit the council pays for.
 *
 * `execute(id)` goes in as a plain `ContractExecute` whose transaction id belongs to the governance
 * account and which two council members sign, rather than through a schedule. `msg.sender` is the
 * governance account either way, so the contract path and its consumption are identical, and it costs
 * one transaction instead of four. What a schedule changes is the price, not the gas.
 */
import { AccountId, Client, PrivateKey, TransactionId } from "@hiero-ledger/sdk";
import { buildCreateProposalCall, encodeTreasurySwap } from "@sh/core/governance/encode";
import { PROPOSAL_TYPES } from "@sh/core/governance/proposalTypes";
import { proposalIdFromContractResult } from "@sh/core/governance/registry";
import { buildExecuteProposalCall } from "@sh/core/governance/schedules";
import { type MirrorContractResult, fetchContractResult, fetchTokenRelationship } from "@sh/core/mirror";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import deployedContracts from "~~/contracts/deployedContracts";
import { loadState } from "~~/scripts/setup/state";
import { createSwapProvider } from "~~/services/swap/createSwapProvider";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";
import { HBAR, htsToken } from "~~/services/swap/types";

const STATE_FILE = fileURLToPath(new URL("../../setup-state.json", import.meta.url));
const NETWORK = "testnet";
const HEDERA_TESTNET_CHAIN_ID = 296;

/** One HBAR: enough to cross the pool and cheap enough to run repeatedly. */
const AMOUNT_IN = 100_000_000n;

/**
 * A scheduled call that succeeds pays its whole limit, so a limit far above what the operation
 * consumes is money the treasury loses on every proposal. The floor is as much a regression as the
 * ceiling; 0.8 is the tightest ratio the two measured runs sit above.
 */
const MIN_LIMIT_USE = 0.8;

const MEASURE_GAS = PROPOSAL_TYPES.treasurySwap.executeGas;

const MIRROR_ATTEMPTS = 16;
const MIRROR_DELAY_MS = 2500;
const STEP_TIMEOUT_MS = 120_000;

type Fixtures = {
  governanceAccountId: string;
  councilKeys: PrivateKey[];
  executorContractId: string;
  operatorId: string;
  operatorKey: PrivateKey;
  adapterAddress: string;
  tokenOut: string;
};

/** Null whenever anything is missing: the suite then skips instead of failing. */
function loadFixtures(): Fixtures | null {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!operatorId || !operatorKey) return null;

  const { governance, seedProposal, demoAccounts } = loadState(STATE_FILE, NETWORK);
  if (!governance || !seedProposal || !demoAccounts.alice || !demoAccounts.bob) return null;

  const adapter = deployedContracts[HEDERA_TESTNET_CHAIN_ID]?.SaucerSwapAdapter;
  if (!adapter) return null;

  return {
    governanceAccountId: governance.accountId,
    councilKeys: [demoAccounts.alice, demoAccounts.bob].map(member => PrivateKey.fromStringDer(member.privateKey)),
    executorContractId: seedProposal.executorContractId,
    operatorId,
    operatorKey: PrivateKey.fromStringECDSA(operatorKey),
    adapterAddress: adapter.address,
    tokenOut: SAUCERSWAP_V2_CONFIG[NETWORK].usdcToken,
  };
}

const fixtures = loadFixtures();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Mirror indexes a contract result a few seconds after consensus; 404 until it does. */
async function waitForResult(transactionId: string): Promise<MirrorContractResult> {
  for (let attempt = 0; attempt < MIRROR_ATTEMPTS; attempt++) {
    await sleep(MIRROR_DELAY_MS);
    try {
      return await fetchContractResult(transactionId, { network: NETWORK });
    } catch {
      continue;
    }
  }
  throw new Error(`Mirror indexed no contract result for ${transactionId}`);
}

describe.skipIf(!fixtures)("treasury swap against SaucerSwap on testnet", () => {
  const given = fixtures as Fixtures;
  let client: Client;
  let result: MirrorContractResult;
  let balanceBefore: number;
  let balanceAfter: number;

  beforeAll(async () => {
    client = Client.forName(NETWORK).setOperator(given.operatorId, given.operatorKey);

    // Checked before anything is spent: unassociated, the swap reverts for a reason no assertion
    // below would explain, so the suite says it here instead of paying to find out.
    balanceBefore = await requireAssociatedTreasury();
    const quote = await createSwapProvider(NETWORK).quote({
      tokenIn: HBAR,
      tokenOut: htsToken(given.tokenOut),
      amountIn: AMOUNT_IN,
    });

    const proposal = encodeTreasurySwap({
      adapter: given.adapterAddress as `0x${string}`,
      tokenOut: longZeroAddress(given.tokenOut),
      fee: SAUCERSWAP_V2_CONFIG[NETWORK].defaultFee,
      recipient: longZeroAddress(given.governanceAccountId),
      amountInTinybars: AMOUNT_IN,
      amountOutMinimum: quote.amountOutMinimum,
    });

    const registration = await buildCreateProposalCall(given.executorContractId, proposal).execute(client);
    await registration.getReceipt(client);
    const registered = await waitForResult(registration.transactionId!.toString());
    const proposalId = proposalIdFromContractResult(registered);
    if (proposalId === null) throw new Error("Mirror reported no proposal id for the registration");

    result = await executeAsCouncil(proposalId, proposal.payableTinybars);
    await sleep(MIRROR_DELAY_MS);
    balanceAfter = await requireAssociatedTreasury();
    client.close();
  }, STEP_TIMEOUT_MS);

  /** A revert leaves its payload here; `TransferFail(21)` is what this used to read. */
  it("completes the swap through the real router without reverting", () => {
    expect(result.error_message).toBeNull();
  });

  it("pays the output to the treasury", () => {
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  it("finishes inside the limit the council pays for", () => {
    expect(result.gas_used).toBeLessThanOrEqual(MEASURE_GAS);
  });

  it("uses enough of that limit to justify it, since the whole limit is charged", () => {
    expect(result.gas_used).toBeGreaterThanOrEqual(MEASURE_GAS * MIN_LIMIT_USE);
  });

  /** Hedera addresses an entity with no EVM alias by its number, zero-padded to twenty bytes. */
  function longZeroAddress(hederaId: string): `0x${string}` {
    const [, , entityNumber] = hederaId.split(".");
    return `0x${BigInt(entityNumber).toString(16).padStart(40, "0")}`;
  }

  /** The treasury's balance of the output token, and a refusal to swap at all without the relation. */
  async function requireAssociatedTreasury(): Promise<number> {
    const relationship = await fetchTokenRelationship(given.governanceAccountId, given.tokenOut, {
      network: NETWORK,
    });
    if (!relationship) {
      throw new Error(
        `The treasury ${given.governanceAccountId} is not associated with ${given.tokenOut}. The pool pays its ` +
          "output through the HTS system contract, which charges an automatic association as gas and cannot fit " +
          "one inside this limit; run `yarn setup` to associate it.",
      );
    }
    return relationship.balance;
  }

  async function executeAsCouncil(proposalId: number, payableTinybars: bigint): Promise<MirrorContractResult> {
    const call = buildExecuteProposalCall({
      executorContractId: given.executorContractId,
      proposalId,
      gas: MEASURE_GAS,
      payableTinybars,
    })
      .setTransactionId(TransactionId.generate(AccountId.fromString(given.governanceAccountId)))
      .freezeWith(client);

    for (const key of given.councilKeys) await call.sign(key);

    const response = await call.execute(client);
    await response.getReceipt(client);
    return waitForResult(response.transactionId!.toString());
  }
});
