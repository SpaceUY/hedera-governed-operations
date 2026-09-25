// @vitest-environment node

/**
 * The inbox against Hedera testnet, on the fixtures `yarn setup` created. It only reads — the Mirror
 * Node and the JSON-RPC relay are both public — so it cannot disturb the seed proposal or cost the
 * governance account anything, and it needs no operator key. It is gated on one anyway, so that
 * every `*.integration.test.ts` skips under the same condition and `yarn test` never reaches the
 * network on its own.
 *
 * What only the network can settle is that the pieces agree: that the key the council was created
 * with is the key the ledger reports, and that a real proposal's progress counts approvals rather
 * than the rows Mirror happens to list.
 */
import { fetchCouncilKey, fetchProposerAccountIds } from "./council";
import { fetchProposalInbox } from "./proposals";
import { fetchRegistryEntries } from "./registry";
import { PublicKey } from "@hiero-ledger/sdk";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOVERNANCE_THRESHOLD } from "~~/scripts/setup/governance";
import { loadState } from "~~/scripts/setup/state";
import { getHederaRpcUrl } from "~~/utils/scaffold-hbar/networks";

const STATE_FILE = fileURLToPath(new URL("../../setup-state.json", import.meta.url));
const NETWORK = "testnet";
const STEP_TIMEOUT_MS = 60_000;

type Fixtures = {
  governanceAccountId: string;
  executorContractId: string;
  /** The entry `yarn setup` leaves pending, so a fresh install opens on something to approve. */
  seedProposalId: number;
  /** Base64 of the demo members' public keys, the encoding Mirror uses for a signature's prefix. */
  demoMemberKeys: string[];
};

const toMemberKey = (der: string) => Buffer.from(PublicKey.fromString(der).toStringRaw(), "hex").toString("base64");

/** Null whenever anything is missing: the suite then skips instead of failing. */
function loadFixtures(): Fixtures | null {
  if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_PRIVATE_KEY) return null;

  const { governance, seedProposal, demoAccounts } = loadState(STATE_FILE, NETWORK);
  if (!governance || !seedProposal || !demoAccounts.alice || !demoAccounts.bob) return null;

  return {
    governanceAccountId: governance.accountId,
    executorContractId: seedProposal.executorContractId,
    seedProposalId: seedProposal.id,
    demoMemberKeys: [demoAccounts.alice.publicKey, demoAccounts.bob.publicKey].map(toMemberKey),
  };
}

const fixtures = loadFixtures();

/** `skipIf` still runs the suite body, so nothing may touch the fixtures outside a test. */
describe.skipIf(!fixtures)("the proposal inbox on testnet", () => {
  const ids = fixtures as Fixtures;

  it(
    "reads the threshold the governance account was created with",
    async () => {
      const council = await fetchCouncilKey(ids.governanceAccountId, NETWORK);

      expect(council).toMatchObject({ threshold: GOVERNANCE_THRESHOLD });
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "reads the demo accounts as members of that key",
    async () => {
      const council = await fetchCouncilKey(ids.governanceAccountId, NETWORK);

      expect(council.memberKeys).toEqual(expect.arrayContaining(ids.demoMemberKeys));
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "enumerates the proposers from the deployed executor",
    async () => {
      const proposers = await fetchProposerAccountIds({
        executorContractId: ids.executorContractId,
        network: NETWORK,
        rpcUrl: getHederaRpcUrl(NETWORK),
      });

      expect(proposers.accountIds.length).toBeGreaterThan(0);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "lists only proposals the governance account pays for",
    async () => {
      const { proposals } = await readInbox();

      expect(proposals.every(({ schedule }) => schedule.payer_account_id === ids.governanceAccountId)).toBe(true);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "credits no approval to a signature from outside the council",
    async () => {
      const { proposals, council } = await readInbox();

      const counted = proposals.flatMap(({ progress }) => progress.signedBy);
      expect(counted.every(signer => council.memberKeys.includes(signer))).toBe(true);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "counts approvals, not the rows Mirror lists",
    async () => {
      const { proposals } = await readInbox();
      const withPayerSignature = proposals.filter(
        ({ schedule, progress }) => schedule.signatures.length > progress.signed,
      );

      // The operator opens every proposal in the demo and holds no seat, so its signature is listed
      // on each one and counts toward none. A run with no proposals at all proves nothing here.
      expect(withPayerSignature.length).toBeGreaterThan(0);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    "describes the seed proposal from what the deployed registry actually stores",
    async () => {
      const entries = await fetchRegistryEntries([ids.seedProposalId], {
        executorContractId: ids.executorContractId,
        rpcUrl: getHederaRpcUrl(NETWORK),
      });

      expect(entries.get(ids.seedProposalId)).toMatchObject({
        status: "read",
        entry: { state: "pending", operation: { kind: "upgrade" } },
      });
    },
    STEP_TIMEOUT_MS,
  );

  async function readInbox() {
    const [council, proposers] = await Promise.all([
      fetchCouncilKey(ids.governanceAccountId, NETWORK),
      fetchProposerAccountIds({
        executorContractId: ids.executorContractId,
        network: NETWORK,
        rpcUrl: getHederaRpcUrl(NETWORK),
      }),
    ]);

    const inbox = await fetchProposalInbox({
      proposerAccountIds: proposers.accountIds,
      unresolvableProposers: proposers.unresolvable,
      governanceAccountId: ids.governanceAccountId,
      council,
      network: NETWORK,
      registry: { executorContractId: ids.executorContractId, rpcUrl: getHederaRpcUrl(NETWORK) },
    });

    return { ...inbox, council };
  }
});
