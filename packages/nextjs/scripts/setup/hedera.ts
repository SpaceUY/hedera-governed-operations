/**
 * Network side of the setup: Hedera SDK writes and Mirror Node reads.
 * Everything here is wrapped behind `SetupActions` / `MirrorLookups` so `reconcile` stays testable.
 */
import type { SetupEnv } from "./env";
import type { MirrorLookups, SetupActions } from "./reconcile";
import type { DemoAccount, DemoAccountName } from "./state";
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TopicCreateTransaction,
} from "@hiero-ledger/sdk";
import { isMirrorNotFound, mirrorGet } from "~~/services/mirror";

/** HBAR sent from the operator to each demo account so it can pay its own fees during a demo. */
export const DEMO_ACCOUNT_INITIAL_HBAR = 5;

const TOPIC_MEMO = "scaffold-hbar receipts / decision log";

export function createClient(env: SetupEnv): Client {
  return Client.forName(env.network).setOperator(env.operatorId, env.operatorPrivateKey);
}

async function createTopic(client: Client): Promise<string> {
  const response = await new TopicCreateTransaction().setTopicMemo(TOPIC_MEMO).execute(client);
  const { topicId } = await response.getReceipt(client);
  if (!topicId) throw new Error("Topic creation returned no topic id");
  return topicId.toString();
}

async function createDemoAccount(client: Client, name: DemoAccountName): Promise<DemoAccount> {
  const key = PrivateKey.generateECDSA();
  const response = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(key)
    .setInitialBalance(new Hbar(DEMO_ACCOUNT_INITIAL_HBAR))
    .setAccountMemo(`scaffold-hbar demo ${name}`)
    .execute(client);
  const { accountId } = await response.getReceipt(client);
  if (!accountId) throw new Error(`Account creation for ${name} returned no account id`);
  return {
    accountId: accountId.toString(),
    privateKey: key.toStringDer(),
    publicKey: key.publicKey.toStringDer(),
    evmAddress: `0x${key.publicKey.toEvmAddress()}`,
  };
}

export async function associateToken(client: Client, account: DemoAccount, tokenId: string): Promise<void> {
  const transaction = new TokenAssociateTransaction()
    .setAccountId(account.accountId)
    .setTokenIds([tokenId])
    .freezeWith(client);
  await transaction.sign(PrivateKey.fromStringDer(account.privateKey));
  const response = await transaction.execute(client);
  await response.getReceipt(client);
}

export function createActions(client: Client): SetupActions {
  return {
    createTopic: () => createTopic(client),
    createDemoAccount: name => createDemoAccount(client, name),
    associateToken: (account, tokenId) => associateToken(client, account, tokenId),
  };
}

/** Resolves false only on a 404; any other Mirror Node failure propagates so a flaky read never triggers a re-create. */
async function mirrorHas(path: string, network: string): Promise<boolean> {
  try {
    await mirrorGet<unknown>(path, network);
    return true;
  } catch (error) {
    if (isMirrorNotFound(error)) return false;
    throw error;
  }
}

type MirrorAccountTokens = { tokens: { token_id: string }[] };

export function createLookups(env: SetupEnv): MirrorLookups {
  return {
    topicExists: topicId => mirrorHas(`/api/v1/topics/${topicId}`, env.network),
    accountExists: accountId => mirrorHas(`/api/v1/accounts/${accountId}`, env.network),
    accountHasToken: async (accountId, tokenId) => {
      const { tokens } = await mirrorGet<MirrorAccountTokens>(
        `/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`,
        env.network,
      );
      return tokens.some(token => token.token_id === tokenId);
    },
  };
}
