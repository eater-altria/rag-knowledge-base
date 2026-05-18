# syntax=docker/dockerfile:1.7
#
# All-in-one image: PostgreSQL (with zhparser) + Qdrant + backend (Fastify) +
# frontend (nginx). Orchestrated by s6-overlay so a single `docker run` is
# enough to bring the whole stack up.
#
# Build (from repo root):
#   docker buildx build -f docker/all-in-one/Dockerfile -t rag-kb:latest .
#
# Run:
#   docker run -d --name rag -p 3000:3000 -v rag-data:/data rag-kb:latest

# ---------- zhparser build (mirrors docker/postgres/Dockerfile) ----------
FROM postgres:16-bookworm AS zhparser
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates git \
      autoconf automake libtool m4 pkg-config \
      postgresql-server-dev-16 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch 1.2.3 https://github.com/hightman/scws.git \
 && cd scws \
 && touch NEWS README AUTHORS ChangeLog \
 && (test -x ./configure || autoreconf -fiv) \
 && ./configure --prefix=/usr/local \
 && make -j"$(nproc)" \
 && make install \
 && ldconfig
RUN git clone --depth 1 https://github.com/amutu/zhparser.git \
 && cd zhparser \
 && make USE_PGXS=1 \
 && make USE_PGXS=1 install

# ---------- backend: compile TS then prune to runtime deps ----------
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app
COPY backend/package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-bookworm-slim AS backend-deps
WORKDIR /app
COPY backend/package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --no-audit --no-fund

# ---------- frontend: vite build ----------
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app
COPY frontend/package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --no-audit --no-fund
COPY frontend/tsconfig.json frontend/tsconfig.node.json frontend/vite.config.ts \
     frontend/tailwind.config.js frontend/postcss.config.js frontend/index.html ./
COPY frontend/src ./src
RUN npm run build

# ---------- pre-built binaries we pull from upstream images ----------
FROM qdrant/qdrant:v1.12.0 AS qdrant-src
FROM node:20-bookworm-slim AS node-src

# ---------- final runtime ----------
FROM postgres:16-bookworm AS runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.0.2

# nginx for serving the SPA + reverse-proxying /api and /mcp; curl for
# liveness probes; libgomp1 for onnxruntime-node; libunwind8 for qdrant
# (libunwind-ptrace.so.0); xz-utils to unpack s6.
RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx curl ca-certificates xz-utils \
      libgomp1 libunwind8 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

# zhparser shared library + PG extension files
COPY --from=zhparser /usr/local/lib/libscws.so*  /usr/local/lib/
COPY --from=zhparser /usr/lib/postgresql/16/lib/zhparser.so       /usr/lib/postgresql/16/lib/zhparser.so
COPY --from=zhparser /usr/share/postgresql/16/extension/zhparser* /usr/share/postgresql/16/extension/
COPY --from=zhparser /usr/share/postgresql/16/tsearch_data/       /usr/share/postgresql/16/tsearch_data/
RUN echo "/usr/local/lib" > /etc/ld.so.conf.d/usr-local.conf && ldconfig

# Node.js binary + bundled npm modules (Bookworm-to-Bookworm, so ABI matches).
COPY --from=node-src /usr/local/bin/node /usr/local/bin/node
COPY --from=node-src /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Qdrant standalone binary + default config dir (multi-arch via upstream).
# We override storage path / bind address via QDRANT__* env in the run script,
# but qdrant still expects to find its config files relative to cwd.
COPY --from=qdrant-src /qdrant/qdrant /opt/qdrant/qdrant
COPY --from=qdrant-src /qdrant/config /opt/qdrant/config

# Backend app: production deps + compiled JS.
WORKDIR /app/backend
COPY backend/package.json ./
COPY --from=backend-deps  /app/node_modules ./node_modules
COPY --from=backend-build /app/dist         ./dist

# Frontend static assets served by nginx.
COPY --from=frontend-build /app/dist /var/www/rag
COPY docker/all-in-one/nginx.conf /etc/nginx/conf.d/rag.conf

# PG bootstrap SQL — the upstream entrypoint runs this on first init.
COPY docker/postgres/init.sql /docker-entrypoint-initdb.d/00-init.sql

# s6-overlay (multi-arch via TARGETARCH).
RUN set -eux; \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
      | tar -C / -Jxpf -; \
    case "${TARGETARCH:-amd64}" in \
      amd64) S6_ARCH=x86_64 ;; \
      arm64) S6_ARCH=aarch64 ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" \
      | tar -C / -Jxpf -

# s6 service tree + first-run script.
COPY docker/all-in-one/rootfs/ /
RUN chmod +x /etc/s6-overlay/scripts/init-env \
             /etc/s6-overlay/s6-rc.d/postgres/run \
             /etc/s6-overlay/s6-rc.d/qdrant/run \
             /etc/s6-overlay/s6-rc.d/backend/run \
             /etc/s6-overlay/s6-rc.d/nginx/run

# Defaults; -e at runtime wins because s6 seeds /run/s6/container_environment
# from docker env before our init-env oneshot runs. Do NOT set S6_KEEP_ENV=1:
# that makes `with-contenv` skip reading /run/s6/container_environment, so
# secrets written there by init-env (POSTGRES_PASSWORD, JWT_SECRET) never
# reach the postgres/backend longruns.
ENV POSTGRES_DB=rag \
    POSTGRES_USER=rag \
    PGDATA=/data/postgres \
    NODE_ENV=production \
    S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
    S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0

VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/init"]
