# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY astro.config.mjs tsconfig.json drizzle.config.ts ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    UPLOADS_DIR=/app/uploads

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs astro \
  && mkdir -p /app/uploads \
  && chown -R astro:nodejs /app

COPY --from=build --chown=astro:nodejs /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=astro:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=astro:nodejs /app/dist ./dist
COPY --from=build --chown=astro:nodejs /app/src ./src
COPY --from=build --chown=astro:nodejs /app/scripts ./scripts
COPY --from=build --chown=astro:nodejs /app/drizzle ./drizzle
COPY --from=build --chown=astro:nodejs /app/drizzle.config.ts /app/tsconfig.json ./
COPY --chown=astro:nodejs docker/entrypoint.sh /app/docker/entrypoint.sh

RUN chmod +x /app/docker/entrypoint.sh

USER astro
EXPOSE 4321

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "./dist/server/entry.mjs"]
