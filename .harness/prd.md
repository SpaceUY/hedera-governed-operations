# Governed operations

## Goal

Keep this Scaffold-HBAR template healthy as a product: a fresh scaffold must install, lint, build and boot, and the governance app must be browsable by someone who has no wallet and no `.env` file. This brief describes the app as it ships; it does not ask the agent to add features.

The template's subject is an approval that no single key can give. A proposer files an operation, the council signs it from their own wallets whenever each of them gets to it, and Hedera executes it once the threshold is met. Collecting the signatures is a ledger service — an account threshold key plus a scheduled transaction — not a contract this template deploys.

## Journeys

1. **Browse without a wallet.** Open the live map, read the treasury figures and the council's threshold, and see the proposals still collecting signatures in the rail beside it. Without a `.env` or a deployment the app says so instead, naming the command that fixes it.
2. **Read a proposal.** Open a proposal from the rail and see what it would do in a sentence, its registry entry, how many of the required signatures it has, and when it expires — all read from the Mirror Node, with no indexer and no wallet.
3. **File a proposal.** Choose an operation kind on `/governance/new` and fill in its form. Without a wallet the page explains that proposing is paid for by the proposer's own account and leaves the button disabled.
4. **Approve from a wallet.** A council member signs a pending proposal with `ScheduleSign` from their wallet. Their signature counts towards the threshold; the network runs the operation by itself once the threshold is reached.

## Hedera services

- **Account threshold keys.** The governance account's key is a `KeyList` with a threshold: the m-of-n is network state, not Solidity.
- **Schedule Service.** A proposal is a scheduled transaction whose payer is the governance account. Each approver's `ScheduleSign` adds one signature; the network executes at the threshold. A schedule can stay pending for up to 62 days (HIP-423).
- **Smart Contract Service.** `GovernedExecutor` decides who may propose; `AcmeVault`, `TokenAdmin` and `SaucerSwapAdapter` are what the council governs.
- **Hedera Token Service.** The demo token's pause and freeze keys are held by a contract the council reaches only through an approved proposal.
- **Hedera Consensus Service.** The release manifest an upgrade is checked against, and the co-signing agent's decision log.
- **Mirror Node REST API.** Every read in the app: proposals, schedules, accounts, tokens and the council's own key.

## Non-goals

- Do not add a second Solidity framework: `packages/hardhat` is the only one.
- Do not switch the package manager away from Yarn.
- Do not remove the Scaffold-HBAR / `AGENTS.md` conventions.
- Do not commit secrets or `.env` files.
- Do not reimplement the multi-signature in Solidity: the threshold key is the point.
- Do not add an indexer or a database; the Mirror Node is the read side.

## Deliverables

- `packages/nextjs` — App Router UI, Hiero SDK + WalletConnect, typed Mirror Node client.
- `packages/core` — proposal types, encoders and decoders, council and registry models, shared by the app and the agent.
- `packages/agent` — the optional co-signing agent: policy per operation kind, release manifest check, decisions published to a topic.
- `packages/hardhat` — Solidity workspace on the Hedera JSON-RPC relay, with deploy and Sourcify verification scripts.
- `README.md` and `AGENTS.md` documenting install, run and validation commands.

## Acceptance

Deterministic checks live in `.harness/validators/`; semantic checks live in `.harness/eval.json`.
