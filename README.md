# Scaffold-HBAR Template (Proof Wall)

Hedera-native **Next.js-only** demo: post timestamped proofs on **Hedera Consensus Service (HCS)**, browse them on a live feed, and earn **HTS badge tokens** for participation. No Solidity workspace or contract deploy required.

Based on the `hedera-demo` template from [hedera-dev/scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar) (branch `templates/hedera-demo`).

```
Wallet connect → Submit HCS message (JSON proof) → Mirror Node feed
Admin (/admin) → Create topic + HTS badge token → env vars for the app
```

General Scaffold-HBAR docs: [Scaffold HBAR on Hedera](https://docs.hedera.com/solutions/tools/scaffold-hbar/index).

## What's in this template

- **Next.js only** — no `packages/hardhat` or `packages/foundry`
- **Proof Wall** at `/` — submit and browse HCS messages on a configured topic
- **My proofs** at `/my-proofs` — filter feed by connected account; badge display
- **Admin** at `/admin` — create HCS topic and HTS badge token via wallet-signed transactions
- Server routes under `packages/nextjs/app/api/hedera/` for Mirror Node and operator helpers

Create a project:

```bash
npm create scaffold-hbar@latest -- --template SpaceUY/scaffold-hbar-template
```

## Quick start

### Prerequisites

- Node.js ≥ 20.18.3, Git
- Yarn (this template is Yarn-only)
- [WalletConnect project ID](https://cloud.reown.com) (Reown / WalletConnect Cloud)
- Hedera testnet account — fund via [portal.hedera.com](https://portal.hedera.com/faucet)

### Install and run

```bash
yarn install

cp packages/nextjs/.env.example packages/nextjs/.env
# Set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID (required)

yarn next:dev    # http://localhost:3000
```

1. Open **Admin** (`/admin`), connect wallet, create a topic (and optionally a badge token).
2. Copy topic ID into `NEXT_PUBLIC_PROOF_WALL_TOPIC_ID` (and badge token into `NEXT_PUBLIC_PROOF_WALL_BADGE_TOKEN_ID` if created).
3. Restart dev server, post a proof on the home page.

## Scripts

| Command | Description |
|---|---|
| `yarn next:dev` | Dev server at http://localhost:3000 |
| `yarn next:build` | Production build |
| `yarn next:check-types` | TypeScript check |
| `yarn lint` / `yarn next:lint` | ESLint |
| `yarn format` | Prettier |

## Validate with Hedera Harness

The template ships a [Hedera Harness](https://github.com/hedera-dev/hedera-harness) recipe under `.harness/` (`hedera-harness` is pinned to `2.0.0-rc.4`, schema v3). It checks that a fresh scaffold installs, lints, builds and boots, and grades the running app against `.harness/eval.json`. The recipe assumes Yarn; if you scaffolded with npm, adjust the commands in `.harness/validators/yarn.json` and `.harness/spec.yaml`.

```bash
npx hedera-harness doctor             # preflight: node, git, recipe, agent CLI, browser
npx hedera-harness validate           # ASSERT + SMOKE: static checks, yarn install/lint/build, home route boots
npx hedera-harness validate-semantic  # EVALUATE: a Claude Code session browses the app and grades eval.json
yarn harness:run                      # full loop: generate from .harness/prd.md, then validate and repair
```

`validate` needs no credentials. `validate-semantic` and `harness:run` need the `claude` CLI authenticated and Chrome (or Playwright Chromium) available. CI runs `doctor --recipe-only` and `validate` on every pull request.

## Project layout

- **packages/nextjs** — App Router UI, Hedera SDK + wallet connect, Mirror Node API routes, Proof Wall components

## Links

- [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)
- [create-scaffold-hbar](https://github.com/hedera-dev/create-scaffold-hbar) — CLI
- [Hedera docs](https://docs.hedera.com/)
- [HashScan testnet](https://hashscan.io/testnet)
