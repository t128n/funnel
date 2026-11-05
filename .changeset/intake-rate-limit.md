---
"funnel": patch
---

Add configurable per-IP intake rate limits and a honeypot to `POST /api/intake` and the `/intake` form. Throttled API calls return `429` with `Retry-After`, the form keeps the draft, and rejected attempts never stage a submission or log content. The three new `intake.*` settings default to 10 per minute, 60 per hour and honeypot enabled; `0` disables a rate window. The limiter is in-process and relies on SvelteKit's trusted client address, so a reverse proxy must configure `ADDRESS_HEADER`/`XFF_DEPTH`.
