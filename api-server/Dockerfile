# syntax=docker/dockerfile:1.4
# check=error=true
#
# This Dockerfile is designed for production, not development.
# Run this from the MONOREPO ROOT:
# docker build -f api-server/Dockerfile -t nua-llm-api .
#
# NOTE: Uses BuildKit features (cache mounts). Requires DOCKER_BUILDKIT=1 if not default.
# Dokku should have BuildKit enabled - see ansible/roles/dokku-applications/tasks/configure_builder.yml

FROM node:23-slim AS base

ENV APP_USER_UID=1000
ENV APP_USER_GID=1000
ENV APP_USER_NAME=node
ENV APP_HOME=/app

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl build-essential python3 dnsutils net-tools && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Throw-away build stage to reduce size of final image
FROM base AS build

# Switch to non-privileged user
USER ${APP_USER_NAME}
WORKDIR $APP_HOME

# Copy root and package files for dependency installation
# .npmrc must be copied before pnpm install for inject-workspace-packages to work
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} api-server/package.json ./api-server/
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} nua-llm-core/package.json ./nua-llm-core/
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} nua-llm-caching/package.json ./nua-llm-caching/
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} nua-client/package.json ./nua-client/

# Install dependencies for all packages
# BuildKit cache mount persists the pnpm store across builds for faster installs.
# Using uid/gid=1000 since we run as non-root 'node' user.
# The 'id' allows sharing this cache across multiple apps on the same Dokku host.
RUN --mount=type=cache,id=pnpm-store,target=/home/node/.local/share/pnpm/store/v3,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile

# Copy application code for all packages
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} . .

# Build all packages (this respects workspace dependencies)
# Use -r to run build recursively in all workspace packages
RUN pnpm -r run build

# Use pnpm deploy to extract the api-server into a standalone production directory
# This creates a self-contained copy with only production dependencies.
#
# IMPORTANT: This requires `inject-workspace-packages=true` in .npmrc (see that file for details).
# Without it, workspace deps (nua-llm-core, nua-llm-caching) would be symlinks that break on copy.
RUN pnpm --filter api deploy /app/prod-api --prod

# Final stage for app image
FROM base

WORKDIR ${APP_HOME}

# Copy the deployed application from the build stage
COPY --from=build --chown=${APP_USER_NAME}:${APP_USER_NAME} /app/prod-api ./

# Ensure the application runs as the non-privileged user
USER ${APP_USER_NAME}

ENV NODE_ENV="production"

# Start the server using pnpm start (which calls node dist/index.js)
CMD ["pnpm", "start"]