# CLAUDE.md

@AGENTS.md

This repository keeps agent guidance in `AGENTS.md` to avoid duplication. Please refer to `AGENTS.md` for the full instructions.

## Contributing (SpaceDev)

This repo is a `create-scaffold-hbar` template maintained by SpaceDev, based on `hedera-dev/scaffold-hbar` (`templates/hedera-demo`, tracked as the `upstream` remote).

- **Package manager: Yarn 3.2.3, never pnpm.** Scaffold-HBAR, `create-scaffold-hbar` and `hedera-harness` require Yarn workspaces; this overrides the SpaceDev default.
- **CLI conventions:** `main` must always be consumable with `npm create scaffold-hbar@latest -- --template SpaceUY/scaffold-hbar-template`. Keep `template.json` valid against the CLI schema; the CLI deletes `template.json` and (for npm users) `.yarn`/`.husky` when scaffolding. Never commit `.env` — only `packages/nextjs/.env.example`.
- **Pull requests:** every PR maps to a ClickUp task. Branch `feature/CU-<id>-<slug>`, title `type: description [CU-<id>]`, PR link commented on the task. `main` is protected: PRs only, CI must pass.
- **Skills to load:** `/frontend` (Next.js), `/blockchain` (Hedera), `/workflow` (PRs), `boy-scout` (clean code, changes proportional to the task — do not refactor upstream code unless the task asks for it).
- `.claude/settings.json` is committed; put personal overrides in `.claude/settings.local.json` (gitignored).
