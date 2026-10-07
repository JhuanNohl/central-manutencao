# syntax=docker/dockerfile:1
# Imagens da API e da web a partir do monorepo (contexto: raiz do repositório).
#   docker build -f docker/Dockerfile --target api .
#   docker build -f docker/Dockerfile --target web .

# Imagens base fixadas pelo digest: o build de hoje e o de amanhã usam o
# mesmo sistema. Para atualizar, troque o digest e valide na homologação.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
ARG CADDY_IMAGE=caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f

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
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------- Web: arquivos estáticos e proxy da API no Caddy ----------
# Caddyfile (homologação, HTTPS próprio) e Caddyfile.producao (atrás do
# Traefik), os dois com o mesmo site.caddy.
FROM ${CADDY_IMAGE} AS web
COPY docker/caddy/ /etc/caddy/
COPY --from=build /app/apps/web/dist /srv
