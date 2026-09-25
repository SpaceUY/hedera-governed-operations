# Architecture

## Overview

This template is a single Next.js (App Router) workspace that talks to Hedera through native services only:

- **Hedera Consensus Service (HCS)** — topics and messages (the Proof Wall feed).
- **Hedera Token Service (HTS)** — fungible badge tokens and airdrops.
- **Mirror Node REST API** — every read: topic messages, accounts, tokens, transactions, schedules.
- **HashPack via WalletConnect** (Reown AppKit + `@hashgraph/hedera-wallet-connect`) — every user-signed write.
- **Test signer** — a disposable ECDSA key injected by Hedera Harness (`localStorage["burnerWallet.pk"]`) that signs in place of HashPack during automated validation; same port, see [Signing port](#signing-port-hashpack-or-test-signer).
- **Hiero SDK** (`@hiero-ledger/sdk`) — builds transactions on the client and on the server.

Contracts live in `packages/hardhat` and reach the network through the Hedera JSON-RPC relay, not the Hiero SDK. Server-side signing happens in Next.js route handlers with an operator key read from the environment, and at deploy time with the encrypted deployer key in `packages/hardhat/.env`.

<!-- TODO(product): add the product-specific flow (governed operations or merchant rails) once the feature set is decided. -->

_Product-specific flows: coming with the first release._

```mermaid
flowchart LR
  Browser["Browser (React, HashPack)"]
  App["Next.js app<br/>pages + route handlers"]
  Hedera["Hedera network<br/>HCS · HTS · Batch"]
  Mirror["Mirror Node REST"]

  Browser -- "wallet-signed tx" --> Hedera
  Browser -- "hooks/mirror (React Query)" --> App
  App -- "operator-signed tx" --> Hedera
  App -- "services/mirrorNode.ts" --> Mirror
  Hedera -. "indexed after a few seconds" .-> Mirror
```

## Signing flows

### User wallet → app → Hedera

The app builds the transaction, freezes it and hands it to HashPack. The user's private key never leaves the wallet.

```mermaid
sequenceDiagram
  participant U as User (HashPack)
  participant A as Next.js client
  participant H as Hedera network
  participant M as Mirror Node

  U->>A: Connect (WalletConnect session)
  A->>A: Build tx with Hiero SDK, freeze with network Client
  A->>U: hedera_signAndExecuteTransaction
  U->>H: Signed transaction
  H-->>U: transactionId
  U-->>A: transactionId
  loop until indexed (3-20 s)
    A->>M: GET /api/v1/... by transactionId
  end
  M-->>A: entity id / message
```

Code: `services/web3/hederaSigner.ts` (wallet calls), `services/web3/hashPackSigner.ts` (port adapter), `hooks/useHederaSigner.ts` (signer in components), `services/web3/NativeTransactionSignerBridge.tsx` (bridge to `@scaffold-hbar-ui/hooks`), `utils/scaffold-hbar/resolve*` (Mirror polling).

### Signing port: HashPack or test signer

Components sign through one port, `HederaSigner` (`services/web3/hederaSignerPort.ts`): `executeTransaction(tx)` and `signTransaction(tx)` plus `kind`, `accountId` and `network`. Two adapters implement it, and `useHederaSigner` picks one per page load:

```mermaid
flowchart LR
  UI["Components / hooks<br/>useHederaSigner()"]
  Port["HederaSigner port"]
  HP["HashPackSigner<br/>WalletConnect session"]
  B["BurnerSigner<br/>ECDSA key from localStorage"]
  M["Mirror Node<br/>GET /accounts/0x{alias}"]
  H["Hedera testnet"]

  UI --> Port
  Port -- "no key stored" --> HP
  Port -- "burnerWallet.pk present" --> B
  B -. "resolve 0.0.x (retry on lag)" .-> M
  HP -- "hedera_signAndExecuteTransaction" --> H
  B -- "freezeWith(client) + execute(client)" --> H
```

- **Selection** (`BurnerSignerProvider`): on load the app reads `localStorage["burnerWallet.pk"]`. If a key is present, allowed by `burnerSignerPolicy.ts` (testnet only; in production builds only with `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true`) and its account resolves on the Mirror Node, the burner becomes the active signer and takes precedence over any HashPack session. Otherwise HashPack is used and the header offers "Connect Wallet".
- **Why**: Hedera Harness CHAIN provisions a funded ECDSA account and injects its key that way, following the burner-wallet pattern of the harness's x402 recipe ([hedera-dev/hedera-harness](https://github.com/hedera-dev/hedera-harness)). HashPack cannot be driven by Playwright, so without this port wallet-gated assertions could only be graded as affordances.
- **UI**: the header shows the burner's `0.0.x` with a "test signer" badge; "Disconnect" forgets the key. Consumers read the payer with `requireAccountId()` and never touch the wallet provider directly, so they do not care which signer is active.
- **Extension point**: `BurnerSigner.publicKey` lets a demo mode put the ephemeral account on-chain beyond paying (for example as a member of a threshold key); a payer-only demo needs nothing beyond the HBAR the harness funds (`chainValidation.fundingHbar`).

### Operator → server route → Hedera

Actions the application pays for run in a route handler with the operator credentials. The client only calls the route; it never sees the key.

```mermaid
sequenceDiagram
  participant A as Next.js client
  participant R as Route handler (app/api/hedera/*)
  participant H as Hedera network

  A->>R: POST (validated body)
  R->>R: hasOperatorKey()? else 503
  R->>R: Build tx, sign with operator Client
  R->>H: execute + getReceipt
  H-->>R: status
  R-->>A: JSON result (no internal errors)
```

Code: `services/hederaClient.ts`, `app/api/hedera/check-badge/route.ts`, `services/badgeService.ts`.

### Batch of inner transactions with a batch key (HIP-551)

Several transactions execute atomically: either all inner transactions succeed or none do. The service holds the batch key; the user signs only their own inner transaction.

```mermaid
sequenceDiagram
  participant U as User (HashPack)
  participant A as Next.js client
  participant S as Service (batch key)
  participant H as Hedera network

  S->>A: Inner tx template (transactionId = payer, batchKey = service, frozen)
  A->>U: hedera_signTransaction (sign only)
  U-->>A: Signed inner tx bytes
  A->>S: Signed inner tx
  S->>S: BatchTransaction.addInnerTransaction(user tx, service txs)
  S->>H: Sign with batch key, execute
  H-->>S: Batch receipt (all-or-nothing)
```

Rules that make this work (verified on testnet):

- Build the inner transaction with `setTransactionId(TransactionId.generate(payer))`, `setBatchKey(serviceKey)`, then `freeze()`.
- Do **not** call `setNodeAccountIds` on an inner transaction: it locks the node list and `freeze()` can no longer pin node `0.0.0`, which batches require.
- The wallet signs the inner transaction with `hedera_signTransaction`; the batch itself is executed by whoever holds the batch key.

## Module map

| Module           | Path (under `packages/nextjs/`)                                                                                                                              | Responsibility                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Signing port     | `services/web3/hederaSignerPort.ts`, `hashPackSigner.ts`, `burnerSigner.ts`, `burnerSignerPolicy.ts`, `BurnerSignerProvider.tsx`, `hooks/useHederaSigner.ts` | `HederaSigner` port, HashPack and test-signer adapters, selection policy and context                     |
| Wallet signer    | `services/web3/hederaSigner.ts`                                                                                                                              | WalletConnect calls: sign-and-execute, sign-only, batch inner-transaction helpers                        |
| Wallet bootstrap | `services/web3/appKitHedera.ts`, `hederaWalletConnect.tsx`, `NativeTransactionSignerBridge.tsx`                                                              | AppKit + `HederaProvider` singletons, session context, bridge to `@scaffold-hbar-ui/hooks`               |
| Mirror client    | `services/mirrorNode.ts`, `hooks/mirror/*`                                                                                                                   | Typed REST client (HTTP only) and React Query hooks; all reads go through here                           |
| Proposals        | `services/governance/schedules.ts`                                                                                                                           | A proposal as a scheduled transaction: create with the governance account as payer, sign, withdraw |
| Swap provider    | `services/swap/*`                                                                                                                                            | `SwapProvider` interface and SaucerSwap V2 implementation — see [Swap provider](#swap-provider)          |
| Operator client  | `services/hederaClient.ts`                                                                                                                                   | Server-side `Client` with the operator key; used only by route handlers                                  |
| Setup script     | root `yarn setup`                                                                                                                                            | Idempotent testnet bootstrap: creates missing resources with the operator and writes ids to `.env.local` |
| Harness          | `.harness/`                                                                                                                                                  | ASSERT (`validators/static.json`, `yarn.json`), SMOKE (`playwright-smoke.yaml`), EVALUATE (`eval.json`)  |
| Demo             | `app/*`, `components/*`, `hooks/use*.ts`, `services/badgeService.ts`, `config/proofWallConfig.ts`                                                            | Proof Wall pages built on the modules above                                                              |

## Verified network constraints and decisions

| Constraint / decision                  | Why                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yarn 3.2.3 only**                    | Scaffold-HBAR, `create-scaffold-hbar` and `hedera-harness` assume Yarn workspaces; the harness forbids `npm`/`pnpm` commands and the recipe uses `yarn` verbs              |
| **Two write paths**                    | Native services go through the Hiero SDK; contracts go through the JSON-RPC relay from `packages/hardhat`, and each deploy regenerates `contracts/deployedContracts.ts`   |
| **Mirror Node lag**                    | Reads after consensus can 404 or return stale pages for several seconds; every post-write read polls with backoff and the UI shows a "resolving" state                     |
| **Freeze before sign**                 | Wallet signing needs a frozen transaction with a fixed transaction id and node ids; `DAppSigner.freezeWithSigner` does not set node ids, so freeze with a network `Client` |
| **Batch inner txs never set node ids** | `setNodeAccountIds` blocks `freeze()` from pinning node `0.0.0`, which HIP-551 inner transactions require                                                                  |
| **HTS keys can be a contract id**       | A council cannot sign an HTS operation: scheduling one is refused outright and a scheduled contract call cannot present the governance key to `0x167`. The token's keys point at `TokenAdmin` instead — see [Governing an HTS token](#governing-an-hts-token-the-contract-as-the-tokens-key) |
| **Schedules are indexed by creator**   | Mirror `/schedules?account.id=` filters by `creator_account_id`, and it lists the payer's signature, which does not count toward a threshold key                           |
| **The proposer withdraws a proposal**  | A schedule is deletable only through an admin key fixed at creation, and that key must sign the creation — so it is the proposer's, not the council's. See [Withdrawing a proposal](#withdrawing-a-proposal-schedule-or-registry) |
| **On-chain quoting for swaps**         | SaucerSwap API reserves do not reflect concentrated-liquidity prices; `amountOutMinimum` must come from `QuoterV2` or the pool's `sqrtRatioX96`                            |
| **Test signer is testnet-only**        | The burner signs with a key stored in the browser; `burnerSignerPolicy.ts` ignores it on mainnet and, in production builds, unless `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true` |
| **Setup targets testnet only**         | `yarn setup` spends operator HBAR and creates entities; it refuses other networks so a misconfigured `.env` cannot touch mainnet                                           |
| **Operator key stays server-side**     | Only route handlers read `HEDERA_OPERATOR_*`; the client learns whether an operator exists through `/api/hedera/operator-status`                                           |
| **`.env.example` is the env contract** | `template.json` carries no `envVars` (the CLI would write a root `.env.example` Next.js does not read); every variable is documented in `packages/nextjs/.env.example`     |

## Governing an HTS token: the contract as the token's key

Pausing a token or freezing an account is a native HTS operation, and a council that holds a
threshold key cannot perform one directly. Two obvious routes fail, each with its own network error,
and the one that works reads like a detour until you see why the other two do not.

**A scheduled `TokenPause` is rejected outright.** Scheduled transactions are limited to a whitelist
set by the network's configuration, and the token operations are not on it:

```
SCHEDULED_TRANSACTION_NOT_IN_WHITELIST
```

**A scheduled contract call with the key on the governance account is rejected by the system
contract.** The obvious repair is to wrap the operation in a contract call, which *is* schedulable,
and leave the token's pause key on the governance account. The schedule collects the m signatures,
executes, and the call reaches HTS at `0x167` — which refuses it:

```
INVALID_FULL_PREFIX_SIGNATURE_FOR_PRECOMPILE
```

The system contract verifies a key by looking for a signature over the transaction carrying a full
public-key prefix. The signatures a schedule collects belong to the scheduled transaction and are
not presented to the system contract in that form, so from inside `0x167` the governance account's
key is simply not there — no matter how many council members signed.

**What works is making the contract itself the key.** A Hedera token key can be a *contract id*, and
the network grants that key to whoever is executing that contract's code. So the token's pause and
freeze keys are set to `TokenAdmin`'s contract id, and `TokenAdmin` accepts calls only from the
executor — whose `execute` is reachable only after m of n council members sign. Authority stops
being something a signature proves to HTS and becomes something the call path proves.

```mermaid
flowchart LR
  Council["m of n council<br/>sign the schedule"] --> Gov["Governance account<br/>(threshold key)"]
  Gov -- "execute(id)" --> Executor["GovernedExecutor<br/>EXECUTOR_ROLE"]
  Executor -- "pause(token)" --> Admin["TokenAdmin<br/>msg.sender == executor"]
  Admin -- "pauseToken" --> HTS["HTS at 0x167<br/>key = TokenAdmin's contract id"]
  HTS --> Token["Token paused"]
```

What `0x167` checks is its **immediate caller**, the contract whose code is running when it is
called — not the payer and not the rest of the chain. That is why the extra hop through the executor
changes nothing, and it is also the pattern's one hard rule: reaching HTS through a `delegatecall`
would present the *calling* contract instead, and the key would have to be declared as a
`delegatableContractId` for that to be accepted.

**Freezing acts on a relationship, not on a token.** `freeze` names a token *and* an account, and
the two must already be associated. Freezing an account that never associated the token answers:

```
TOKEN_NOT_ASSOCIATED_TO_ACCOUNT  (184)
```

Association is the receiving account's own act — a contract deployed through the JSON-RPC relay gets
unlimited automatic associations, while an account created through the SDK gets none unless asked
for them. Whoever the demo freezes has to hold the token first.

**HTS answers with a code; `TokenAdmin` turns a refusal into a revert.** The system contract reports
failure by returning a response code, not by reverting, so a contract that ignores it would let a
refused operation finish as a successful transaction: the proposal would be marked executed and the
scheduled transaction carrying the council's approval would be spent on nothing. `TokenAdmin`
reverts with `HtsRejected(responseCode)` instead, which leaves the proposal pending and
reschedulable once the cause is fixed, and carries the code out to the Mirror Node for the UI to
explain.

**The keys are permanent, and that is a choice.** A token created without an admin key can never
have its keys changed, so its pause and freeze keys point at that one `TokenAdmin` deployment
forever: redeploying the contract means the token is administered by the old one, and there is no
way back. This template takes that deliberately — the point is that governance cannot be walked
back — but a deployment that needs an escape hatch gives the token an admin key held by the same
contract and an operation to re-point the keys, which is one more governed operation, not a
loophole.

**Cost.** Measured on testnet through the full chain, each operation consumes 65k–68k gas, refusals
included, which puts the schedule's gas limit at 90,000. The limit is a price, not a ceiling (see
the table above), so it belongs to the operation: a token-admin proposal is not an upgrade (99k) and
not a swap (241k).

## Withdrawing a proposal: schedule or registry

A pending proposal exists twice — as an entry in `GovernedExecutor` and as the scheduled transaction
the council signs — and each one is retracted differently.

**The schedule.** Hedera deletes a schedule only through an admin key fixed when the schedule is
created; without one, `ScheduleDelete` comes back `SCHEDULE_IS_IMMUTABLE` and the only way out is
waiting for the expiry. And naming a key that does not sign the `ScheduleCreate` fails with
`INVALID_SIGNATURE`, which settles whose key it is: the governance account's threshold key in that
slot would make opening a proposal an m-of-n vote of its own, so the admin key is the proposer's own
key, read from the Mirror Node at creation time (`fetchAccountPublicKey`). Deleting ends **one round
of approval**: the registry entry stays pending and anyone may schedule `execute(id)` again.

**The registry.** `cancel(id)` ends the proposal itself, and the proposer can call it directly — no
schedule, no quorum — because the contract grants cancellation to the proposer and to the governance
account. For the council, cancelling is a proposal like any other.

The two have to move in that order. A schedule left alive for an already cancelled proposal is a
trap: when its threshold is reached, `execute` reverts with `ProposalNotPending` and the governance
account pays for the gas the revert consumed. So the app deletes the schedule first and cancels
afterwards. A native proposal — rotating the council through an `AccountUpdate` — has no registry
entry at all, and there the delete is the only retraction there is.

## What a redeploy repairs, and what it does not

Every contract here trusts `GovernedExecutor`, and redeploying it splits them in two. `TokenAdmin`
and `SaucerSwapAdapter` take the executor as a **constructor argument**, so the same
`yarn hardhat:deploy` that produced a new executor also produces new ones pointing at it: the
binding is recreated, and nothing has to be checked. `AcmeVault` does not. Its executor is set in
`initialize`, the state lives in the proxy rather than in the implementation, and there is no setter
— by design, since a vault that can be re-pointed at another executor is a vault whose governance
can be swapped out. So a redeployed executor leaves the proxy trusting an address that no longer
runs anything, and hardhat-deploy has no reason to notice: the proxy is still deployed.

Two more bindings cannot be repaired at all. The demo token's pause and freeze keys are
`TokenAdmin`'s contract id and the token has no admin key, so a redeployed `TokenAdmin` orphans the
token for good; the governance account's threshold key cannot be replaced without a transaction the
council itself signs, so a changed `HEDERA_COUNCIL_ACCOUNT_ID` means a new account.

What makes these worth naming is that they fail late. Nothing rejects a proposal aimed at a stale
vault: it is registered, the council signs the schedule, the schedule is spent, and the call reverts
with `NotExecutor` at the very end. `yarn setup` therefore reads both permanent bindings back from
the chain before it uses them — the token's pause key from consensus, the vault's `executor()`
through the relay — and stops with the recovery in the message. They are different recoveries:
the vault is redeployed against the current executor (its deployment records removed first), while
an orphaned token is replaced by a new one and left on testnet, unusable.

## Swap provider

`packages/nextjs/services/swap/` is the app's only contact with a DEX. Everything else talks to the `SwapProvider` type in `types.ts`:

```ts
quote({ tokenIn, tokenOut, amountIn }); // → { amountOut, amountOutMinimum, route }
buildSwapStep({
  tokenIn,
  tokenOut,
  amountIn,
  amountOutMinimum,
  recipient,
  deadline,
}); // → ContractExecuteTransaction
```

Amounts are `bigint` in the smallest unit of each token (tinybar for HBAR). Tokens are Hedera ids wrapped in a small union, `HBAR` or `htsToken("0.0.x")`, so "native HBAR" is a typed value and never a magic string. `buildSwapStep` returns a built transaction that is not frozen, signed or executed: the caller decides whether it goes through the wallet, the server operator or as an inner transaction of an atomic batch. The DEX pays `tokenOut` straight to `recipient`, so settlement never passes through a contract of ours.

**Why an interface**

The DEX is load-bearing (there is no "pay in HBAR, receive USDC" without one) and at the same time the part most likely to change: a different DEX, a different fee tier, a router upgrade, or mainnet versus testnet. Keeping it behind `SwapProvider` lets the rest of the app and its tests depend on a two-method contract instead of on SaucerSwap's ABI, addresses or quoting quirks. The one implementation today is `SaucerSwapV2Provider` (`saucerSwapV2Provider.ts`); `createSwapProvider(network)` in `createSwapProvider.ts` picks it and wires the network-specific pieces.

**Quoting on-chain, and the `Too little received` lesson**

SaucerSwap V2 is a concentrated-liquidity AMM (Uniswap V3 model). The pool reserves published by its REST API are not the executable price: the first swap built from them reverted in the router with `Too little received`, because the real output was below the `amountOutMinimum` derived from those reserves. The provider therefore quotes on-chain with `QuoterV2.quoteExactInputSingle`, read through a gas-free `eth_call` on the JSON-RPC relay (`jsonRpcQuoter.ts`). The quoter simulates the exact swap the router will run, so `amountOut` is the executable amount and `amountOutMinimum = amountOut × (10000 − slippageBps) / 10000` (integer math, `slippage.ts`) is a meaningful floor. Slippage defaults to `DEFAULT_SLIPPAGE_BPS` (50 bps) and is a constructor option.

The quoter and the swap share the same inputs on purpose (`tokenIn`, `tokenOut`, `fee`, `amountIn`, no `sqrtPriceLimitX96`): anything that changes one must change the other, or the quote stops describing the swap.

**Hedera-specific traps the provider absorbs**

- **HBAR in.** The router only knows the WHBAR token. HBAR is passed as the transaction's payable amount, `tokenIn` is encoded as WHBAR and the router wraps it. HBAR is accepted as `tokenIn` only; to receive HBAR, ask for the WHBAR token as `tokenOut`.
- **Recipient address.** An account created from an ECDSA key has an EVM alias. HTS transfers to that account's long-zero address (`0x…<account num>`) revert inside the router with HTS code `282 INVALID_ALIAS_KEY`. `buildSwapStep` takes the recipient as a Hedera id and resolves the address the network knows it by through Mirror Node (`accountResolver.ts`), which returns the alias when there is one and the long-zero address otherwise.
- **HTS in.** With an HTS `tokenIn` there is no payable amount: the router pulls the tokens, so the payer must have granted it an allowance beforehand (`AccountAllowanceApproveTransaction`). The module builds the swap only; the HTS-in path has not been exercised on testnet yet.
- **Failure mode.** Minimum output and deadline are validated before encoding and enforced by the router, so a stale quote fails the transaction instead of settling at a worse price. Inside an atomic batch that failure reverts the whole batch.

**Testing without the network**

The two network reads are injected: `SaucerSwapQuoter` (the quoter call) and `AccountResolver` (the Mirror Node lookup). Unit tests pass mocks for both and assert the calldata against a vector encoded independently with ethers, the slippage boundaries, the validation errors and the payable amount. `createSwapProvider` is the only place that builds the real JSON-RPC and Mirror Node implementations.

**Adding another DEX**

1. Add `services/swap/<dex>Config.ts` with every contract id, token id and fee tier per network (`testnet`, `mainnet`), verified against Mirror Node.
2. Implement `SwapProvider` in `services/swap/<dex>Provider.ts`. Keep the ABI in one file, quote on-chain, keep the price and slippage math in pure functions and inject any network read so tests stay offline.
3. Register it in `PROVIDER_FACTORIES` in `createSwapProvider.ts` and extend the `SwapDex` union; callers select it with `createSwapProvider(network, { dex })`.
4. Verify one real swap on testnet with the final code and note the transaction in the pull request.
