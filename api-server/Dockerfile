# syntax=docker/dockerfile:1
# check=error=true

# This Dockerfile is designed for production, not development.
# Run this from the MONOREPO ROOT:
# docker build -f api-server/Dockerfile -t nua-llm-api .

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
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} api-server/package.json ./api-server/
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} nua-llm-core/package.json ./nua-llm-core/
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} nua-llm-caching/package.json ./nua-llm-caching/
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} client/package.json ./client/

# Install dependencies for all packages
RUN pnpm install --frozen-lockfile

# Copy application code for all packages
COPY --chown=${APP_USER_NAME}:${APP_USER_NAME} . .

# Build all packages (this respects workspace dependencies)
RUN pnpm run build

# Use pnpm deploy to extract the api-server into a standalone production directory
# This will include only production dependencies and handle workspace links
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