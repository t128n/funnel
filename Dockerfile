# syntax=docker/dockerfile:1

# Funnel container image.
#
# This is the *secondary* delivery path (Railway, Coolify, Fly, Kubernetes).
# The primary artifact is the native executable built by
# `scripts/build-standalone.ts`; the container simply wraps the same binary for
# Linux, so there is one build pipeline and one runtime, not two.
#
# Runtime state (SQLite database + attachment uploads) lives under /data, which
# must be a mounted volume. Funnel is a long-lived single instance — it owns its
# database and must not be scaled horizontally.
#
# Build:  docker build -t funnel .
# Run:    docker run --rm -p 3000:3000 -v funnel-data:/data \
#           -e FUNNEL_SECRET=... -e FUNNEL_URL=https://funnel.example.com funnel
#
# Migrations run automatically on boot (the executable applies them before it
# starts listening). A separate release step is also available:
#   docker run --rm -v funnel-data:/data -e FUNNEL_SECRET=... <image> --migrate

# ---- build ----------------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

# Install with the lockfile first so the dependency layer caches.
# The host-side `.dockerignore` keeps node_modules, build output and local
# state out of the context.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# The target's satteri platform package comes from `bun install` above; on
# amd64 that is @bruits/satteri-linux-x64-gnu. Building for another
# architecture means changing this target to match.
RUN bun run build \
 && bun scripts/build-standalone.ts --target=bun-linux-x64

# ---- runtime --------------------------------------------------------------
# The compiled binary is self-contained (Bun runtime, server, client assets and
# migrations are embedded); the base image only has to provide glibc, the C++
# runtime the native addon links against, and CA roots for outbound TLS.
FROM debian:stable-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates libstdc++6 libatomic1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    FUNNEL_DATA_DIR=/data

COPY --from=build /app/dist/funnel /usr/local/bin/funnel
RUN mkdir -p /data

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/funnel", "--healthcheck"]

ENTRYPOINT ["/usr/local/bin/funnel"]
