# Deploy Funnel with Docker

Build the container image and run one Funnel instance with its database and uploads on a persistent `/data` volume.

## Before you start

- Docker Engine on an x86-64 Linux host. The `Dockerfile` compiles a `bun-linux-x64` executable; on an arm64 host, change the `--target` in the Dockerfile to `bun-linux-arm64` and build there, because the build stage installs only the host platform's native `satteri` package.
- A public origin for the instance, for example `https://funnel.example.com`. Set `FUNNEL_URL` to it before the first onboarding run, so the GitHub App's callback URLs are registered correctly.
- A `FUNNEL_SECRET` of at least 32 characters, generated once and stored safely. For example, `openssl rand -base64 32`. Do not regenerate it when recreating the container: it decrypts the GitHub App credentials and stored OAuth tokens, and signs sessions. Keep it out of shell history by using your platform's secret store or an env file where possible.

## 1. Build the image

```sh
docker build -t funnel:1.2.3 .
```

Or use the mise task, which tags the image for you:

```sh
mise run docker --version=1.2.3
# or: VERSION=1.2.3 mise run docker
```

The image wraps the same standalone executable used by the Windows and bare-metal paths. The application version is embedded from `package.json` at build time; the image tag is only a label.

## 2. Create the volume and run the container

```sh
docker volume create funnel-data

docker run -d --name funnel --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v funnel-data:/data \
  -e FUNNEL_SECRET='<at least 32 characters>' \
  -e FUNNEL_URL='https://funnel.example.com' \
  -e BODY_SIZE_LIMIT=25M \
  -e TZ=UTC \
  funnel:1.2.3
```

- `-p 127.0.0.1:3000:3000` is for a reverse proxy on the same host. If the container is directly exposed, publish `-p 3000:3000` instead.
- The volume must be mounted at `/data` (or `FUNNEL_DATA_DIR` must point at the mounted path). The image sets `FUNNEL_DATA_DIR=/data` and derives `FUNNEL_DB=/data/funnel.db` and `FUNNEL_UPLOAD_DIR=/data/uploads`. Without the volume, every recreate loses onboarding, settings, users and uploads.
- `BODY_SIZE_LIMIT=25M` is only needed for the attachment dropbox. adapter-node defaults to `512K`, which rejects larger uploads before Funnel sees them. Keep it at least as large as `FUNNEL_UPLOAD_MAX_BYTES` (10 MiB by default) plus multipart overhead.
- `TZ=UTC` is optional but recommended: the nightly reconciliation runs at 03:00 local time.
- If the instance is reachable before it has been claimed, add `-e FUNNEL_ONBOARDING_TOKEN='<token>'` so only token-holders can complete onboarding.

A minimal Compose service is equivalent:

```yaml
services:
  funnel:
    image: funnel:1.2.3
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - funnel-data:/data
    environment:
      FUNNEL_SECRET: ${FUNNEL_SECRET}
      FUNNEL_URL: https://funnel.example.com
      BODY_SIZE_LIMIT: 25M
      TZ: UTC

volumes:
  funnel-data:
```

## 3. Finish onboarding and check health

Open `https://funnel.example.com/` (or `http://<host>:3000/` if you are testing locally). A fresh instance redirects application routes to `/onboarding`; the health probes still answer. Create and install the GitHub App there. See [Onboard the GitHub App](../configure/onboard-github-app.md).

The image defines a `HEALTHCHECK` that runs `funnel --healthcheck` every 30 seconds, with a 5-second timeout, a 20-second start period and three retries. It probes only liveness:

```sh
docker ps                      # STATUS should show (healthy)
docker inspect --format '{{.State.Health.Status}}' funnel
```

Use the HTTP probes for orchestration:

- `GET /healthz` — liveness. Returns `200 {"status":"ok","service":"funnel"}` whenever the process is running; it does not touch the database.
- `GET /readyz` — readiness. Returns `200 {"status":"ready","applied":N,"expected":N}` only when the database is reachable and every committed migration is applied. It returns `503` with `database not migrated` or `migrations pending` before then.

## 4. Let migrations run, or run them as a release step

The container entrypoint is the standalone executable, so it applies pending migrations before it starts listening. A successful boot logs:

```text
[funnel] database ready at /data/funnel.db (0 migration(s) applied, N total)
```

If a migration fails, the process exits non-zero instead of serving against a half-migrated database.

For a separate release phase, run the same image with `--migrate` and the same volume:

```sh
docker run --rm -v funnel-data:/data funnel:1.2.3 --migrate
```

The command applies pending migrations, prints the result and exits. It is idempotent. Run it with the old container stopped, and pass the same `FUNNEL_DB` if you overrode it. The runtime image does not contain Bun or the source tree, so `bun run release` is the checkout/build-stage equivalent, not a command you can run inside this image.

## 5. Keep it to one instance

Funnel owns a SQLite file and an in-memory sync worker and SSE bus. Run exactly one container against one volume:

- Do not use `docker compose up --scale`, Swarm replicas, or more than one Kubernetes replica.
- Do not run the old and new containers against the same volume at the same time, including during a rolling deploy. Stop first, then start.
- Use a local or block-backed volume. SQLite locking over NFS or other network filesystems is unreliable.
- The sync worker, nightly reconciliation timer and `/api/events` streams all live in the process, so a second replica would duplicate polls and split the event audience rather than add capacity.

## 6. PaaS notes

Railway, Coolify, Fly.io and Kubernetes work when the platform provides a persistent volume and a single long-lived instance:

- Mount the volume at `/data` (or set `FUNNEL_DATA_DIR` to the mount path). Set `FUNNEL_SECRET`, `FUNNEL_URL`, and `BODY_SIZE_LIMIT` as service variables; there is no `.env` inside the image.
- Set the replica count to one and disable autoscaling. A scale-to-zero platform pauses sync while idle and is not a supported shape.
- Point liveness at `/healthz` and readiness at `/readyz` where the platform distinguishes them. If it has a single health check, use `/healthz` so a long migration does not trigger a restart loop, and verify `/readyz` yourself after deploy.
- If the platform supports a release or pre-deploy command, use `<image> --migrate`. Otherwise rely on migrations at boot.
- Ensure the platform's proxy does not buffer `/api/events`. The SSE stream sends a heartbeat every 12 seconds and the app already sends `X-Accel-Buffering: no`, but some proxies still need explicit buffering disabled. See [Put Funnel behind a reverse proxy](reverse-proxy.md).
- Route to the port in `PORT` (the image defaults to `3000`). Many platforms inject their own `PORT`; Funnel respects it.

## 7. Back up the volume

The volume holds all runtime state: `funnel.db`, its `-wal` and `-shm` sidecars while running, and `uploads/`. Stop the container before copying it, or use SQLite's online backup mechanism; copying only `funnel.db` while the WAL holds recent commits produces an incomplete backup. Record the environment values, especially `FUNNEL_SECRET`, with the backup. See [Back up and restore](../operate/backup-and-restore.md).

## Related

- [Environment variables](../../reference/environment-variables.md) — defaults for `FUNNEL_DATA_DIR`, `FUNNEL_DB`, `BODY_SIZE_LIMIT` and the rest.
- [Command-line interface](../../reference/cli.md) — `--migrate`, `--healthcheck`, `--version`.
- [Build tasks](../../reference/build-tasks.md) — `mise run docker` and the other release tasks.
- [Deployment model](../../explanation/deployment-model.md) — why one instance and one volume.
- [Put Funnel behind a reverse proxy](reverse-proxy.md)
- [Use GitHub Enterprise Server](github-enterprise-server.md)
- [Back up and restore](../operate/backup-and-restore.md)
- [Upgrade Funnel](../operate/upgrade.md)
- [Troubleshoot](../operate/troubleshoot.md)
