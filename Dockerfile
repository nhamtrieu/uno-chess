# syntax=docker/dockerfile:1
# Two images from one file:  docker build --target server .   |   docker build --target web .
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

# Install dependencies first so source changes do not bust this layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS source
COPY packages packages
COPY apps apps

# ---------- game server (Colyseus + API) ----------
FROM source AS server
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["pnpm", "--filter", "@uno-chess/server", "exec", "tsx", "src/index.ts"]

# ---------- web (Next.js) ----------
FROM source AS web-build
# NEXT_PUBLIC_* values are baked into the browser bundle at build time.
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN pnpm --filter @uno-chess/web build

FROM web-build AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@uno-chess/web", "start"]
