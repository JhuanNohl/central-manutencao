# syntax=docker/dockerfile:1
# Imagens da API e da web a partir do monorepo (contexto: raiz do repositório).
#   docker build -f docker/Dockerfile --target api .
#   docker build -f docker/Dockerfile --target web .

ARG NODE_IMAGE=node:24-alpine

# ---------- Dependências e build dos três pacotes ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build

# ---------- API: só dependências de produção, sem root ----------
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @central/api --include-workspace-root=false \
  && npm cache clean --force
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/legal apps/api/legal
WORKDIR /app/apps/api
# Os caminhos relativos da configuração (arquivos e termo) partem daqui.
RUN mkdir -p storage/files && chown -R node:node storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------- Web: arquivos estáticos e proxy da API no Caddy ----------
FROM caddy:2-alpine AS web
COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
