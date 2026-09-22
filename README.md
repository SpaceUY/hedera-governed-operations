# Hedera Governed Operations

A Scaffold-HBAR template pairing a **Hardhat workspace** with a Next.js app on HCS, HTS and the Mirror Node: a reusable HashPack signer, a typed Mirror Node client, a swap provider and an automated testnet setup — all validated with Hedera Harness.

<!-- TODO(product): replace the positioning line and the demo description once the shipped feature set is decided. -->

_The final feature set is still being decided. Coming with the first release._

|                    | `blank`                 | `hedera-demo`              | **this template**                                                            |
| ------------------ | ----------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| Solidity workspace | yes (Hardhat / Foundry) | no                         | yes (Hardhat)                                                                |
| Wallet             | EVM (wagmi)             | HashPack via WalletConnect | HashPack via WalletConnect, reusable signer with sign-only and batch helpers |
| Reads              | JSON-RPC                | Mirror Node API routes     | typed Mirror Node client + React Query hooks                                 |
| Swaps              | —                       | —                          | `SwapProvider` interface with a SaucerSwap V2 implementation                 |
| Testnet setup      | manual                  | manual (`/admin` page)     | `yarn setup` (idempotent, writes `.env.local`)                               |
| Harness recipe     | —                       | —                          | `.harness/` with ASSERT, SMOKE and EVALUATE stages                           |

Based on the `hedera-demo` template from [hedera-dev/scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar) (branch `templates/hedera-demo`). General Scaffold-HBAR docs: [Scaffold HBAR on Hedera](https://docs.hedera.com/solutions/tools/scaffold-hbar/index).

## Quick start

### Prerequisites

- Node.js ≥ 20.18.3, Git
- Yarn (this template is Yarn-only)
- A Hedera **testnet** account with HBAR — create and fund it at [portal.hedera.com](https://portal.hedera.com)
- A [WalletConnect project ID](https://cloud.reown.com) (Reown / WalletConnect Cloud)
- [HashPack](https://www.hashpack.app/) with a testnet account, to sign from the browser

### Create, configure, run

```bash
npm create scaffold-hbar@latest -- --template SpaceUY/hedera-governed-operations
cd <your-project>
yarn install

cp packages/nextjs/.env.example packages/nextjs/.env
# Fill in HEDERA_OPERATOR_ID, HEDERA_OPERATOR_PRIVATE_KEY, HEDERA_COUNCIL_ACCOUNT_ID
# and NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID

yarn setup                                   # testnet resources; stops once the contracts are the next step
yarn hardhat:deploy --network hederaTestnet  # see Contracts below for the deployer account
yarn setup                                   # demo token and the first proposal
yarn next:dev                                # http://localhost:3000
```

`yarn setup` creates an HCS topic, two funded ECDSA demo accounts (`alice`, `bob`) associated with testnet USDC (`0.0.5449`), and the governance account: a 2-of-3 threshold key over your own account (`HEDERA_COUNCIL_ACCOUNT_ID`) and those two. Every id lands in `packages/nextjs/.env.local`.

It runs on either side of the deploy because the dependency is circular: the contracts are deployed against the governance account, so it has to exist first, and the demo token's pause and freeze keys are `TokenAdmin`'s contract id, which a token created without an admin key can never change — so the contract has to exist before the token. The first run hands the deploy the two values it needs through `packages/hardhat/.env`; the second creates the token and leaves one proposal pending for the council to approve. [The runbook](docs/RUNBOOK.md) walks all three steps.

It is idempotent: ids are kept in `packages/nextjs/setup-state.json` (gitignored, holds the demo keys), verified against the network on every run, and only missing pieces are created — a third run creates nothing. It refuses `HEDERA_NETWORK=mainnet`. Product-specific fixtures plug into the hooks in `packages/nextjs/scripts/setup/extensions.ts`. If you prefer to create the resources by hand, open `/admin`, connect HashPack and copy the ids it prints into `packages/nextjs/.env`.

### Contracts

`packages/hardhat` targets the Hedera JSON-RPC relay (`hederaTestnet`, chain 296) and ships the five contracts this template governs:

| Contract            | What it is                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `GovernedExecutor`  | The proposal registry. Proposing is a role; executing takes the council's m-of-n approval      |
| `AcmeVault`         | Upgradeable vault behind a UUPS proxy; its upgrades are the operation the council approves     |
| `AcmeVaultV2`       | The implementation that upgrade points the proxy at — it is what unlocks withdrawals           |
| `TokenAdmin`        | Holds the demo token's pause and freeze keys, and accepts calls only from the executor         |
| `SaucerSwapAdapter` | Swaps treasury HBAR on SaucerSwap V2, again only when reached through an approved proposal     |

Add yours under `contracts/` with a matching script under `deploy/`.

```bash
yarn hardhat:account:generate          # encrypted deployer key in packages/hardhat/.env, then fund it at the faucet
yarn hardhat:deploy --network hederaTestnet
yarn hardhat:verify:testnet            # Sourcify, prints the HashScan link for each contract
```

Every deploy regenerates `packages/nextjs/contracts/deployedContracts.ts` with the addresses and ABIs the frontend reads. See `packages/hardhat/README.md` for the local forked node and the mainnet commands.

## What's inside

### Routes

| Route           | Purpose                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `/`             | Proof Wall — submit a proof (HCS message) and browse the live feed for the configured topic |
| `/my-proofs`    | Proofs filtered by the connected account; badge display                                     |
| `/admin`        | Create an HCS topic and an HTS badge token with wallet-signed transactions                  |
| `/explorer`     | Read-only Mirror Node view: decoded topic messages and schedule state, no wallet needed     |
| `/api/hedera/*` | Server routes: Mirror Node proxies, operator status, badge airdrop                          |

### Modules

| Module             | Path (under `packages/nextjs/`)                             | What it gives you                                                                                           |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Wallet signer      | `services/web3/hederaSigner.ts`, `hooks/useHederaSigner.ts` | HashPack session via WalletConnect, sign-and-execute, sign-only and HIP-551 batch inner-transaction helpers |
| Mirror Node client | `services/mirrorNode.ts`, `hooks/mirror/*`                  | Typed REST client and React Query hooks for topics, accounts, tokens and transactions                       |
| Swap provider      | `services/swap/*`                                           | `SwapProvider` interface with a SaucerSwap V2 implementation and on-chain quoting                           |
| Operator client    | `services/hederaClient.ts`                                  | Server-side Hiero SDK client for operator-signed routes                                                     |
| Setup script       | `yarn setup`                                                | Idempotent testnet bootstrap that writes `.env.local`                                                       |
| Harness recipe     | `.harness/`                                                 | Static, command, smoke and semantic checks for the template                                                 |
| Contracts          | `packages/hardhat/`                                         | Hardhat on the Hedera JSON-RPC relay, deploys that regenerate `contracts/deployedContracts.ts`, Sourcify verification |

## Scripts

| Command                        | Description                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `yarn setup`                   | Create missing testnet resources and write their ids to `packages/nextjs/.env.local` |
| `yarn next:dev`                | Dev server at http://localhost:3000                                                  |
| `yarn next:build`              | Production build                                                                     |
| `yarn next:check-types`        | TypeScript check                                                                     |
| `yarn lint` / `yarn next:lint` | ESLint                                                                               |
| `yarn test`                    | Unit tests (Vitest)                                                                  |
| `yarn format`                  | Prettier                                                                             |
| `yarn harness:run`             | Full Hedera Harness loop (generate, validate, repair)                                |
| `yarn hardhat:compile`         | Compile the contracts under `packages/hardhat/contracts/`                            |
| `yarn hardhat:test`            | Contract tests                                                                       |
| `yarn hardhat:account:generate`| Create an encrypted deployer key in `packages/hardhat/.env`                          |
| `yarn hardhat:deploy`          | Deploy and regenerate `packages/nextjs/contracts/deployedContracts.ts`               |
| `yarn hardhat:verify:testnet`  | Verify the testnet deployments on Sourcify and print their HashScan links            |

## Make it yours

The template separates the **demo** from the **reusable patterns** so you can delete the former and keep the latter.

| Demo (safe to remove)                                                                                           | Reusable pattern (keep)                                          |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `app/page.tsx`, `app/my-proofs/`, `app/admin/`                                                                  | `services/web3/hederaSigner.ts`, `hooks/useHederaSigner.ts`      |
| `components/ProofWall.tsx`, `ProofCard.tsx`, `SubmitProofForm.tsx`, `TopicSelector.tsx`, `BadgeDisplay.tsx`     | `services/mirrorNode.ts`, `hooks/mirror/*`                       |
| `hooks/useSubmitProof.ts`, `useTopicMessages.ts`, `useCreateTopic.ts`, `useCreateToken.ts`, `useBadgeTokens.ts` | `services/swap/*`                                                |
| `services/badgeService.ts`, `app/api/hedera/check-badge`, `airdrop`                                             | `services/hederaClient.ts` and the operator-signed route pattern |
| `config/proofWallConfig.ts`                                                                                     | `yarn setup` and `.harness/`                                     |

To remove the demo:

1. Delete the files in the left column and the `NEXT_PUBLIC_PROOF_WALL_*` lines from `packages/nextjs/.env.example`.
2. Replace `app/page.tsx` with your own page; keep `app/layout.tsx` and `components/ScaffoldHbarAppWithProviders.tsx` (they wire the wallet and React Query).
3. Update `.harness/eval.json` and `.harness/validators/playwright-smoke.yaml` so the harness grades your routes instead of the Proof Wall.
4. Run `yarn next:check-types` to find any leftover imports.

<!-- TODO(product): once the feature set is decided, list which demo pages ship and which become examples in docs/. -->

## Validate with Hedera Harness

The template ships a [Hedera Harness](https://github.com/hedera-dev/hedera-harness) recipe under `.harness/` (`hedera-harness` is pinned to `2.0.0-rc.4`, schema v3). It checks that a fresh scaffold installs, lints, builds and boots, and grades the running app against `.harness/eval.json`. The recipe assumes Yarn; if you scaffolded with npm, adjust the commands in `.harness/validators/yarn.json` and `.harness/spec.yaml`.

```bash
npx hedera-harness doctor             # preflight: node, git, recipe, agent CLI, browser
npx hedera-harness validate           # ASSERT + SMOKE: static checks, yarn install/lint/test/build, home route boots
npx hedera-harness validate-semantic  # EVALUATE: a Claude Code session browses the app and grades eval.json
yarn harness:run                      # full loop: generate from .harness/prd.md, then validate and repair
```

`validate` needs no credentials. `validate-semantic` and `harness:run` need the `claude` CLI authenticated and Chrome (or Playwright Chromium) available. CI runs `doctor --recipe-only` and `validate` on every pull request.

The recipe also enables the CHAIN stage: `validate-semantic` and `harness:run` create a funded, disposable testnet account and hand its key to the app as `localStorage["burnerWallet.pk"]`, so wallet-gated assertions run end to end and are verified on the Mirror Node (the account is swept back afterwards). Export the operator in the shell first — the harness does not read `.env`:

```bash
export HEDERA_OPERATOR_ID=0.0.xxxxx
export HEDERA_OPERATOR_PRIVATE_KEY=<ECDSA private key>
npx hedera-harness doctor             # now also checks the two variables
npx hedera-harness validate-semantic
```

The app treats that key as a **test signer** (`packages/nextjs/services/web3/burnerSigner.ts`): testnet only, active in dev builds, opt-in for production with `NEXT_PUBLIC_ENABLE_BURNER_SIGNER=true`. Without the key, HashPack is used as usual.

## Evidence on testnet

<!-- TODO(product): add the release demo (sample proof, badge token, product journey) once it has been run on testnet. -->

Every module was exercised on testnet with the code in this repository:

| What                                              | HashScan                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topic created from `/admin`, signed with HashPack | [0.0.10650370](https://hashscan.io/testnet/topic/0.0.10650370)                                                                                              |
| Topic created by `yarn setup`                     | [0.0.10650162](https://hashscan.io/testnet/topic/0.0.10650162)                                                                                              |
| Demo accounts created by `yarn setup`             | [0.0.10650163](https://hashscan.io/testnet/account/0.0.10650163) (`alice`), [0.0.10650164](https://hashscan.io/testnet/account/0.0.10650164) (`bob`)        |
| Swap 1 HBAR → USDC through the `SwapProvider`     | [0.0.8192684@1790003842.988101841](https://hashscan.io/testnet/transaction/0.0.8192684@1790003842.988101841)                                                |

_Release demo evidence: coming with the first release._

## Docs

- [Architecture](docs/ARCHITECTURE.md) — signing flows, module map, verified network constraints
- [Runbook](docs/RUNBOOK.md) — step-by-step reproduction on testnet, harness stages, troubleshooting
- [AGENTS.md](AGENTS.md) — briefing for coding agents (Cursor, Claude Code, Codex)

## Links

- [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)
- [create-scaffold-hbar](https://github.com/hedera-dev/create-scaffold-hbar) — CLI
- [Hedera docs](https://docs.hedera.com/)
- [HashScan testnet](https://hashscan.io/testnet)

## Disclaimer

Experimental software: not audited, testnet first. Review every module before using it with mainnet funds.

## Licence

MIT — see [LICENCE](LICENCE).
