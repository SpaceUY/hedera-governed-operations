# CLAUDE.md

@AGENTS.md

This repository keeps agent guidance in `AGENTS.md` to avoid duplication. Please refer to `AGENTS.md` for the full instructions.

## Contributing

This repo is a `create-scaffold-hbar` template based on `hedera-dev/scaffold-hbar` (`templates/hedera-demo`, tracked as the `upstream` remote).

- **Package manager: Yarn 3.2.3.** Scaffold-HBAR, `create-scaffold-hbar` and `hedera-harness` require Yarn workspaces; do not switch this repo to npm or pnpm.
- `main` must always be consumable with `npm create scaffold-hbar@latest -- --template SpaceUY/scaffold-hbar-template`. Keep `template.json` valid against the CLI schema; the CLI removes `template.json` (and `.yarn`/`.husky` for npm users) when scaffolding. Never commit `.env` — only `packages/nextjs/.env.example`.
- Work on feature branches and open a pull request; CI must pass before merging.
- `.claude/settings.json` is committed; put personal overrides in `.claude/settings.local.json` (gitignored).
