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
import {
  AccountCreateTransaction,
  type Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  KeyList,
  PublicKey,
  TokenCreateTransaction,
  TokenId,
  TokenInfoQuery,
  TokenType,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { createPublicClient, http, parseAbi } from "viem";
import { type MirrorAccount, fetchAccount } from "~~/services/mirror";

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

async function accountIdentity(accountId: string, network: string) {
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

export type GovernanceSetupLookups = GovernanceLookups &
  DemoTokenLookups &
  SeedProposalLookups & { accountHbarBalance(accountId: string): Promise<number> };

export type GovernanceSetupActions = GovernanceActions & DemoTokenActions & SeedProposalActions;

export function createGovernanceLookups(env: SetupEnv, client: Client): GovernanceSetupLookups {
  const { network } = env;
  const relay = createPublicClient({
    transport: http(process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL?.trim() || DEFAULT_TESTNET_RPC_URL),
  });

  return {
    accountExists: accountId => mirrorHas(`/api/v1/accounts/${accountId}`, network),
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
    createGovernanceAccount: members => createGovernanceAccount(client, members),
    createDemoToken: tokenAdminContractId => createDemoToken(client, env, tokenAdminContractId),
    associateToken: (account, tokenId) => associateToken(client, account, tokenId),
    fundHolder: (account, tokenId, amount) => fundHolder(client, env, account, tokenId, amount),
    createProposal: (executorContractId, targetEvm, calldata) =>
      createProposal(client, executorContractId, targetEvm, calldata),
  };
}
