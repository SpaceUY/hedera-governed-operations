# Template baseline

## Goal

Keep this Scaffold-HBAR template healthy as a product: a fresh scaffold must install, lint, build and boot, and the Proof Wall demo must be browsable by someone who has no wallet and no `.env` file. This brief describes the app as it ships; it does not ask the agent to add features.

## Journeys

1. **Browse without a wallet.** Open the home page, see the Proof Wall and the wallet-connect affordance, and read the empty state or the feed for the configured topic.
2. **Configuration.** Copy `packages/nextjs/.env.example` to `packages/nextjs/.env`, set the WalletConnect project id and, after creating a topic, the topic id; restart and see the feed pick it up.
3. **Wallet-gated actions.** With a connected Hedera account, submit a proof from the home page and create an HCS topic or an HTS badge token from `/admin`.

## Hedera services

- Hedera Consensus Service (HCS): topic creation and message submission for proofs.
- Hedera Token Service (HTS): badge token creation and balance checks.
- Mirror Node REST API: topic messages, account and token lookups through the routes under `packages/nextjs/app/api/hedera/`.

## Non-goals

- Do not add a second Solidity framework: `packages/hardhat` is the only one.
- Do not switch the package manager away from Yarn.
- Do not remove the Scaffold-HBAR / `AGENTS.md` conventions.
- Do not commit secrets or `.env` files.

## Deliverables

- `packages/nextjs` — App Router UI, Hedera SDK + WalletConnect, Mirror Node API routes.
- `packages/hardhat` — Solidity workspace on the Hedera JSON-RPC relay, with deploy and Sourcify verification scripts.
- `README.md` and `AGENTS.md` documenting install, run and validation commands.

## Acceptance

Deterministic checks live in `.harness/validators/`; semantic checks live in `.harness/eval.json`.
