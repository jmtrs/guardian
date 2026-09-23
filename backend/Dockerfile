# Backend Guardian (NestJS + Prisma). Build y runtime.
# IMPORTANTE: el contexto de build es la RAIZ del repo (necesita pnpm-lock y el
# workspace), no backend/. Ver homelab/services/guardian/compose.yml.

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app
# Prisma necesita openssl para generar/ejecutar.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

# Manifiestos primero: cachea la instalacion mientras no cambien.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter backend...

# Fuente del backend + generacion de cliente Prisma + build Nest.
COPY backend ./backend
RUN pnpm --filter backend exec prisma generate \
    && pnpm --filter backend run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# node_modules del workspace (hoisted a la raiz) + los propios del backend +
# artefactos compilados y el esquema/migraciones para `migrate deploy`.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/package.json ./package.json
COPY backend/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
# Arranque: aplica migraciones y levanta Nest (ver entrypoint).
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
