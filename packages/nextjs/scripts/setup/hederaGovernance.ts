/**
 * Network side of the governed-operations fixtures: Hiero SDK writes, Mirror Node reads and the
 * one relay read that asks the registry whether a proposal is still pending. Everything is wrapped
 * behind the service types each reconcile declares, so the decisions stay testable without a network.
 */
import { DEMO_TOKEN, type DemoTokenActions, type DemoTokenLookups } from "./demoToken";
import type { SetupEnv } from "./env";
import { GOVERNANCE_THRESHOLD, type GovernanceActions, type GovernanceLookups } from "./governance";
import { accountHasToken, accountTokens, associateToken, mirrorHas } from "./hedera";
import { SEED_PROPOSAL_GAS, type SeedProposalActions, type SeedProposalLookups } from "./seedProposal";
import type { DemoAccount } from "./state";
import type { TreasuryAssociationActions } from "./treasuryAssociation";
import {
  AccountCreateTransaction,
  AccountId,
  type Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  KeyList,
  PrivateKey,
  PublicKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenInfoQuery,
  TokenType,
  TopicCreateTransaction,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { type MirrorAccount, fetchAccount, fetchTopic, hasSubmitKey, isMirrorNotFound } from "@sh/core/mirror";
import { createPublicClient, http, parseAbi } from "viem";
import { parseOperatorKey } from "~~/services/operatorKey";

/**
 * HBAR the governance account starts with. It is the payer of every scheduled approval, and the
 * gas limit on a scheduled call is a price rather than a ceiling, so this is spending money: the
 * costliest operation in the demo, the treasury swap, runs at roughly a third of an HBAR.
 */
export const GOVERNANCE_INITIAL_HBAR = 20;

/** Below this the demo starts failing on payment rather than on governance, so the run says so. */
export const GOVERNANCE_LOW_BALANCE_HBAR = 5;

const TINYBAR_PER_HBAR = 100_000_000;

const DEFAULT_TESTNET_RPC_URL = "https://testnet.hashio.io/api";

const EXECUTOR_ABI = parseAbi([
  "function proposal(uint256 id) view returns ((address target, address proposer, uint8 state, bytes data))",
]);

const VAULT_ABI = parseAbi(["function executor() view returns (address)"]);

/** `ProposalState.Pending`, the first member of the enum the registry stores. */
const PROPOSAL_PENDING = 0;

function publicKeyFromMirror(accountId: string, key: MirrorAccount["key"]): PublicKey {
  if (key?._type === "ECDSA_SECP256K1") return PublicKey.fromStringECDSA(key.key);
  if (key?._type === "ED25519") return PublicKey.fromStringED25519(key.key);
  throw new Error(
    `Account ${accountId} holds a ${key?._type ?? "missing"} key. A member of the governance threshold key has to ` +
      "be an account with a single key of its own, which is what a wallet creates.",
  );
}

export async function accountIdentity(accountId: string, network: string) {
  const account = await fetchAccount(accountId, { network });
  if (!account.evm_address) {
    throw new Error(
      `The Mirror Node knows no EVM address for account ${accountId}. Every contract here is deployed against one, ` +
        "so a council member has to be an account created from an ECDSA key, which is what a wallet creates.",
    );
  }
  return {
    publicKey: publicKeyFromMirror(accountId, account.key).toStringDer(),
    evmAddress: account.evm_address,
  };
}

/**
 * The account every approval flows through. Two details are deliberate: the key is a `KeyList` with
 * a threshold, which is what makes an approval m-of-n, and the account is asked for unlimited
 * automatic token associations. An account created through the SDK gets none by default, and a
 * treasury that cannot receive a token cannot be the output of a swap; adding them afterwards
 * would itself need the council's signatures.
 *
 * The slots are necessary and **not sufficient**. They let a plain `CryptoTransfer` deliver a token
 * the account has never held, but a token arriving from inside a contract call is a different
 * matter: there the automatic association is charged to the call as gas, and it costs more than a
 * governed operation's gas limit, so `reconcileTreasuryAssociation` is what actually makes a swap's
 * output reachable.
 */
async function createGovernanceAccount(client: Client, memberPublicKeys: string[]) {
  const members = memberPublicKeys.map(key => PublicKey.fromString(key));
  const response = await new AccountCreateTransaction()
    .setKeyWithoutAlias(new KeyList(members, GOVERNANCE_THRESHOLD))
    .setInitialBalance(new Hbar(GOVERNANCE_INITIAL_HBAR))
    .setMaxAutomaticTokenAssociations(-1)
    .setAccountMemo(`scaffold-hbar governance ${GOVERNANCE_THRESHOLD}-of-${members.length}`)
    .execute(client);

  const { accountId } = await response.getReceipt(client);
  if (!accountId) throw new Error("Governance account creation returned no account id");
  return { accountId: accountId.toString(), evmAddress: `0x${accountId.toEvmAddress()}` };
}

/**
 * Created with its pause and freeze keys on the `TokenAdmin` contract and with no admin key, so
 * the council owns those two operations and nobody — including whoever runs this script — can ever
 * take them back.
 */
async function createDemoToken(client: Client, env: SetupEnv, tokenAdminContractId: string): Promise<string> {
  const tokenAdmin = ContractId.fromString(tokenAdminContractId);
  const response = await new TokenCreateTransaction()
    .setTokenName(DEMO_TOKEN.name)
    .setTokenSymbol(DEMO_TOKEN.symbol)
    .setTokenType(TokenType.FungibleCommon)
    .setInitialSupply(DEMO_TOKEN.initialSupply)
    .setTreasuryAccountId(env.operatorId)
    .setPauseKey(tokenAdmin)
    .setFreezeKey(tokenAdmin)
    .setFreezeDefault(false)
    .execute(client);

  const { tokenId } = await response.getReceipt(client);
  if (!tokenId) throw new Error("Demo token creation returned no token id");
  return tokenId.toString();
}

/**
 * Signed by council members rather than by the operator that pays for it: the account's key is the
 * threshold key, so associating a token on it is an act of the council, the same as approving a
 * proposal. In the demo the signers are the two demo seats, which is exactly the threshold.
 */
async function associateGovernanceToken(
  client: Client,
  governanceAccountId: string,
  tokenId: string,
  signers: DemoAccount[],
): Promise<void> {
  const transaction = new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(governanceAccountId))
    .setTokenIds([TokenId.fromString(tokenId)])
    .freezeWith(client);

  for (const signer of signers) await transaction.sign(PrivateKey.fromStringDer(signer.privateKey));

  const response = await transaction.execute(client);
  await response.getReceipt(client);
}

async function fundHolder(client: Client, env: SetupEnv, account: DemoAccount, tokenId: string, amount: number) {
  const response = await new TransferTransaction()
    .addTokenTransfer(tokenId, env.operatorId, -amount)
    .addTokenTransfer(tokenId, account.accountId, amount)
    .execute(client);
  await response.getReceipt(client);
}

/** The operator holds `PROPOSER_ROLE` from the executor's constructor, so it can register this itself. */
async function createProposal(
  client: Client,
  executorContractId: string,
  targetEvm: string,
  calldata: string,
): Promise<number> {
  const response = await new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(executorContractId))
    .setGas(SEED_PROPOSAL_GAS)
    .setFunction(
      "createProposal",
      new ContractFunctionParameters().addAddress(targetEvm).addBytes(Buffer.from(calldata.slice(2), "hex")),
    )
    .execute(client);

  const record = await response.getRecord(client);
  const result = record.contractFunctionResult;
  if (!result) throw new Error("Registering the seed proposal returned no contract result");
  return result.getUint256(0).toNumber();
}

/**
 * Read from consensus rather than from the Mirror Node: Mirror returns a key that points at a
 * contract as an opaque protobuf blob, while the SDK hands back the contract id itself.
 */
async function tokenPauseKeyContractId(client: Client, network: string, tokenId: string): Promise<string | undefined> {
  if (!(await mirrorHas(`/api/v1/tokens/${tokenId}`, network))) return undefined;
  const { pauseKey } = await new TokenInfoQuery().setTokenId(TokenId.fromString(tokenId)).execute(client);
  if (pauseKey instanceof ContractId) return pauseKey.toString();
  return "a key that is not a contract";
}

export type TopicTrustLookups = {
  /** Whether the topic exists and only its submit key can write to it. */
  topicIsSigned(topicId: string): Promise<boolean>;
};

export type GovernanceSetupLookups = GovernanceLookups &
  DemoTokenLookups &
  SeedProposalLookups &
  TopicTrustLookups & { accountHbarBalance(accountId: string): Promise<number> };

export type SignedTopicActions = {
  /** Creates the topic release manifests are published to. */
  createReleaseTopic(): Promise<string>;
  /** Creates the topic the agent publishes its decisions to, held by the agent's own key. */
  createDecisionTopic(agentPublicKey: string): Promise<string>;
};

export type GovernanceSetupActions = GovernanceActions &
  DemoTokenActions &
  SeedProposalActions &
  SignedTopicActions &
  TreasuryAssociationActions;

const RELEASE_TOPIC_MEMO = "governed-operations release manifests";

const DECISION_TOPIC_MEMO = "governed-operations agent decisions";

/**
 * A topic of its own rather than the demo's. Anyone can read either, but mixing release records
 * into a feed the demo also writes to would leave the agent's check filtering someone else's
 * messages out of the answer to "what did this team publish".
 *
 * **The submit key is the whole point of the topic.** Without one the network accepts a message
 * from any account, and a manifest read off it proves only that somebody published those bytes —
 * an attacker could name their own implementation and the agent's check would pass. The operator
 * holds it because the operator is what `yarn release:publish` signs with; in a real deployment it
 * belongs to whatever identity the release pipeline runs as. The admin key is there so a team can
 * rotate the submit key later: a topic created without one can never be changed.
 */
async function createReleaseTopic(client: Client, env: SetupEnv): Promise<string> {
  const operatorKey = parseOperatorKey(env.operatorPrivateKey).publicKey;
  const response = await new TopicCreateTransaction()
    .setTopicMemo(RELEASE_TOPIC_MEMO)
    .setSubmitKey(operatorKey)
    .setAdminKey(operatorKey)
    .execute(client);
  const { topicId } = await response.getReceipt(client);
  if (!topicId) throw new Error("Release topic creation returned no topic id");
  return topicId.toString();
}

/**
 * The topic the co-signing agent writes its decisions to.
 *
 * **Its submit key is the agent's, not the operator's**, and that is the whole difference from the
 * release topic. The claim a release manifest makes is "this team published this build", so the
 * publisher is the team; the claim a decision makes is "this agent approved this proposal", so the
 * publisher is the agent. A log the operator could also write to would be a log of what somebody
 * said the agent did. The admin key stays with the operator so the submit key can be rotated when
 * the seat changes hands.
 *
 * In the demo the seat is a demo account (`AGENT_SEAT`); in a real deployment it is whatever
 * identity runs the service, and this is the key that has to change with it.
 */
async function createDecisionTopic(client: Client, env: SetupEnv, agentPublicKey: string): Promise<string> {
  const response = await new TopicCreateTransaction()
    .setTopicMemo(DECISION_TOPIC_MEMO)
    .setSubmitKey(PublicKey.fromString(agentPublicKey))
    .setAdminKey(parseOperatorKey(env.operatorPrivateKey).publicKey)
    .execute(client);
  const { topicId } = await response.getReceipt(client);
  if (!topicId) throw new Error("Decision topic creation returned no topic id");
  return topicId.toString();
}

/**
 * A topic the state already names is reused only if it still refuses messages from strangers. An
 * older run of this script created the release topic without a submit key, and since it also created
 * it without an admin key there is no fixing that one in place: the answer is a new topic.
 */
async function topicIsSigned(topicId: string, network: string): Promise<boolean> {
  try {
    const topic = await fetchTopic(topicId, { network });
    return !topic.deleted && hasSubmitKey(topic);
  } catch (error) {
    if (isMirrorNotFound(error)) return false;
    throw error;
  }
}

export function createGovernanceLookups(env: SetupEnv, client: Client): GovernanceSetupLookups {
  const { network } = env;
  const relay = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL?.trim() || DEFAULT_TESTNET_RPC_URL),
  });

  return {
    accountExists: accountId => mirrorHas(`/api/v1/accounts/${accountId}`, network),
    topicIsSigned: topicId => topicIsSigned(topicId, network),
    accountIdentity: accountId => accountIdentity(accountId, network),
    accountHbarBalance: async accountId => {
      const account = await fetchAccount(accountId, { network });
      return (account.balance?.balance ?? 0) / TINYBAR_PER_HBAR;
    },
    tokenPauseKeyContractId: tokenId => tokenPauseKeyContractId(client, network, tokenId),
    accountHasToken: (accountId, tokenId) => accountHasToken(accountId, tokenId, network),
    accountTokenBalance: async (accountId, tokenId) => {
      const tokens = await accountTokens(accountId, tokenId, network);
      return tokens.find(token => token.token_id === tokenId)?.balance ?? 0;
    },
    vaultExecutor: vaultProxyEvm =>
      relay.readContract({
        address: vaultProxyEvm as `0x${string}`,
        abi: VAULT_ABI,
        functionName: "executor",
      }),
    proposalSettled: async (executorContractId, proposalId) => {
      const executorEvm = `0x${ContractId.fromString(executorContractId).toEvmAddress()}` as `0x${string}`;
      const registered = await relay.readContract({
        address: executorEvm,
        abi: EXECUTOR_ABI,
        functionName: "proposal",
        args: [BigInt(proposalId)],
      });
      return registered.state !== PROPOSAL_PENDING;
    },
  };
}

export function createGovernanceActions(env: SetupEnv, client: Client): GovernanceSetupActions {
  return {
    createReleaseTopic: () => createReleaseTopic(client, env),
    createDecisionTopic: agentPublicKey => createDecisionTopic(client, env, agentPublicKey),
    createGovernanceAccount: members => createGovernanceAccount(client, members),
    createDemoToken: tokenAdminContractId => createDemoToken(client, env, tokenAdminContractId),
    associateToken: (account, tokenId) => associateToken(client, account, tokenId),
    associateGovernanceToken: (governanceAccountId, tokenId, signers) =>
      associateGovernanceToken(client, governanceAccountId, tokenId, signers),
    fundHolder: (account, tokenId, amount) => fundHolder(client, env, account, tokenId, amount),
    createProposal: (executorContractId, targetEvm, calldata) =>
      createProposal(client, executorContractId, targetEvm, calldata),
  };
}
