# Put Funnel behind a reverse proxy

Terminate TLS at a reverse proxy, forward the original protocol and host to Funnel, and keep the Server-Sent Events (SSE) stream unbuffered.

## Before you start

- A DNS name and certificate for the instance, for example `funnel.example.com`.
- Funnel running on the same host (typically reachable at `127.0.0.1:3000`) or on a trusted internal network.
- `FUNNEL_URL` set to the public HTTPS origin. Set it before onboarding, because the GitHub App's callback URLs are registered from it.

## 1. Set the public origin and trust the proxy headers

In Funnel's environment (`.env` for the Windows service, `-e` for Docker, service variables on a PaaS):

```dotenv
FUNNEL_URL=https://funnel.example.com
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
```

`PROTOCOL_HEADER` and `HOST_HEADER` tell adapter-node which request headers carry the original scheme and host. Behind a TLS-terminating proxy they are what make SvelteKit generate `https://` redirects, pass its origin/CSRF check, and build the right onboarding callback base. `FUNNEL_URL` remains the authoritative public origin for onboarding, Better Auth, and (when set) SvelteKit's canonical origin.

Direct HTTP instances do not need these headers: the packaged executable derives the scheme from the request, and onboarding cookies are only marked `Secure` when the request itself is HTTPS.

Only trust these headers when the proxy is the sole route to Funnel. On a native Windows or Linux install, also set `HOST=127.0.0.1` to bind Funnel to loopback. In Docker, leave `HOST=0.0.0.0` (the image default) and publish the port only on the host's loopback (`-p 127.0.0.1:3000:3000`): the container's loopback is private to the container, so binding to `127.0.0.1` inside it would make the published port unreachable. Otherwise, firewall the application port so clients cannot reach it directly and spoof the headers.

If the proxy runs on another host or in another container on a shared network, keep `HOST=0.0.0.0` and restrict the application port to the proxy's address.

## 2. Proxy the application

The essential nginx server block:

```nginx
server {
    listen 443 ssl;
    server_name funnel.example.com;

    ssl_certificate     /etc/ssl/certs/funnel.example.com.pem;
    ssl_certificate_key /etc/ssl/private/funnel.example.com.key;

    # At least FUNNEL_UPLOAD_MAX_BYTES plus multipart overhead.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location = /api/events {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Server-Sent Events must flush as they are written.
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

A Caddy equivalent, with automatic TLS and explicit forwarded headers:

```caddyfile
funnel.example.com {
	reverse_proxy 127.0.0.1:3000 {
		header_up X-Forwarded-Proto {scheme}
		header_up X-Forwarded-Host {host}
		flush_interval -1
	}
}
```

`header_up Host {host}` is preserved by default in Caddy; add it if your Caddy version or another layer rewrites the host.

## 3. Disable buffering for SSE

Funnel's stream is `GET /api/events`:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no`
- `retry: 5000` and a `: connected` comment at the start
- a `: ping` comment every 12 seconds

The app already sends `X-Accel-Buffering: no`, which nginx honours, but set `proxy_buffering off` explicitly. Also disable caching and compression on that location: a buffer or compressor can hold small heartbeat frames until enough data accumulates, which looks like a frozen cockpit or a stream that reconnects every minute.

The proxy read timeout must be longer than the heartbeat. The default nginx `proxy_read_timeout` of 60 seconds is technically enough for a 12-second heartbeat, but a 3,600-second timeout avoids surprises from intermediate load balancers and idle connection reapers. Do not set a timeout shorter than about 30 seconds.

No WebSocket support is required. Funnel uses ordinary HTTP Server-Sent Events; do not add `Upgrade` or `Connection: upgrade` headers.

## 4. Raise body-size limits for uploads

Attachment uploads are bounded at three layers:

- adapter-node rejects a request larger than `BODY_SIZE_LIMIT` before Funnel sees it. The default is `512K`.
- Funnel rejects a single file larger than `FUNNEL_UPLOAD_MAX_BYTES`. The default is `10 MiB` (`10485760` bytes).
- The proxy has its own limit; nginx defaults to `1m`.

If you use the attachment dropbox, set all three to compatible values. For example, a 20 MiB per-file cap with a 25 MiB request body:

```dotenv
FUNNEL_UPLOAD_MAX_BYTES=20971520
BODY_SIZE_LIMIT=25M
```

```nginx
client_max_body_size 25m;
```

`BODY_SIZE_LIMIT` and the proxy limit must be at least as large as `FUNNEL_UPLOAD_MAX_BYTES`, with room for the multipart envelope. If you do not use attachments, the defaults are adequate.

## 5. Verify

From the host:

```sh
curl -fsS https://funnel.example.com/healthz
curl -i https://funnel.example.com/readyz
```

- `/healthz` returns `200` and `{"status":"ok","service":"funnel"}`.
- `/readyz` returns `200` with `applied` and `expected` counts once migrations are complete. A `503` here is a readiness problem, not a proxy problem; see [Troubleshoot](../operate/troubleshoot.md).

Then:

1. Sign in through GitHub. A `redirect_uri_mismatch` or a login loop usually means `FUNNEL_URL`, the forwarded host, or the scheme does not match the App's registered callback.
2. Open the cockpit and watch the browser's network panel. `/api/events` should stay `200` with type `text/event-stream` and show heartbeat frames roughly every 12 seconds.
3. Upload a file to an issue's dropbox. A `413` from the proxy means `client_max_body_size`; a `413` from Funnel means `BODY_SIZE_LIMIT` or `FUNNEL_UPLOAD_MAX_BYTES`.

Common proxy status codes: `502` means the proxy cannot reach Funnel; `504` means a timeout, often on `/api/events`; `413` means a body limit; a login loop means origin or forwarded-header mismatch.

## 6. Restart behaviour

Funnel's default graceful-shutdown window is 30 seconds (`SHUTDOWN_TIMEOUT`). On restart the proxy may briefly return `502`; retry after the process is listening and `/readyz` is `200`. Do not route to the new process before readiness just because `/healthz` answers.

## Related

- [Environment variables](../../reference/environment-variables.md) — `PROTOCOL_HEADER`, `HOST_HEADER`, `BODY_SIZE_LIMIT`, `SHUTDOWN_TIMEOUT`.
- [Command-line interface](../../reference/cli.md) — `--healthcheck` and the release flags.
- [Deployment model](../../explanation/deployment-model.md) — liveness, readiness and the single instance.
- [Deploy with Docker](docker.md)
- [Install as a Windows service](windows-service.md)
- [Use GitHub Enterprise Server](github-enterprise-server.md)
- [Troubleshoot](../operate/troubleshoot.md)
