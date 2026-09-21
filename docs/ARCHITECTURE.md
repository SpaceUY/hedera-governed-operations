## Swap provider

`packages/nextjs/services/swap/` is the app's only contact with a DEX. Everything else talks to the `SwapProvider` type in `types.ts`:

```ts
quote({ tokenIn, tokenOut, amountIn })                                  // → { amountOut, amountOutMinimum, route }
buildSwapStep({ tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline })  // → ContractExecuteTransaction
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
