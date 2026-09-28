# The agent shares `@sh/core` with the app as TypeScript source, so the image is built from the
# workspace root rather than from this directory:
#
#   docker build -f packages/agent/Dockerfile -t governed-operations-agent .
#
# Every workspace manifest is copied because Yarn resolves the whole workspace or none of it, which
# makes the image larger than the agent needs. That is the trade taken here: one obvious Dockerfile
# over a smaller image built by rewriting the manifest at build time.
#
# What the context excludes is in `.dockerignore` at the repository root, and it has to live there:
# Docker reads the one at the root of the build context, so a `.dockerignore` next to this file
# would be ignored and `COPY packages/agent` would carry an operator's `.env` into the image.
FROM node:20-alpine

WORKDIR /app

# The Yarn release and plugins are committed, so the image downloads no package manager.
COPY .yarnrc.yml package.json yarn.lock ./
COPY .yarn/releases ./.yarn/releases
COPY .yarn/plugins ./.yarn/plugins
COPY packages/core/package.json ./packages/core/
COPY packages/agent/package.json ./packages/agent/
COPY packages/nextjs/package.json ./packages/nextjs/
COPY packages/hardhat/package.json ./packages/hardhat/

# `--immutable` fails on a lockfile that does not match the manifests, which is what should happen
# in an image build. `HUSKY=0` is what husky itself reads to skip installing hooks; the image has no
# git repository, and the root `postinstall` would otherwise fail the build.
RUN HUSKY=0 yarn install --immutable --mode=skip-build

COPY packages/core ./packages/core
COPY packages/agent ./packages/agent

# A service that holds a signing key should not run as root; the base image ships `node` for it.
USER node

ENV NODE_ENV=production

# The policy is mounted, not baked in: it is the document an operator reviews and changes.
#   docker run --env-file packages/agent/.env \
#     -v "$PWD/packages/agent/policy.example.json:/policy.json:ro" \
#     -e AGENT_POLICY_FILE=/policy.json governed-operations-agent
CMD ["yarn", "workspace", "@sh/agent", "start"]
