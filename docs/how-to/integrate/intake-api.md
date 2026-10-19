# Intake API

Stage an external submission in Funnel's triage queue with `POST /api/intake`, without any GitHub credentials or authentication.

## Endpoint

`POST /api/intake` accepts a JSON object `{ title, body?, source? }` and stores it as a staged row. The handler lives in `src/routes/api/intake/+server.ts`; the request schema is `intakeSchema` in `src/lib/server/intake/schema.ts`, and the published contract is [`static/openapi.yml`](../../../static/openapi.yml), served verbatim at `/openapi.yml`.

| Field    | Type   | Required | Limit                               | Notes                                                                        |
| :------- | :----- | :------- | :---------------------------------- | :--------------------------------------------------------------------------- |
| `title`  | string | yes      | non-empty and ≤256 characters, **after trimming** | The leading/trailing whitespace is stripped before validation and storage. |
| `body`   | string | no       | ≤65536 characters                   | Defaults to `""` when omitted. Markdown is preserved verbatim.               |
| `source` | string | no       | trimmed                             | Free-form provenance label (the calling page or CLI). An empty value is stored as `null`. |

Unknown properties are ignored rather than rejected, matching GitHub's leniency for forward compatibility. For example `{ "title": "Extra", "urgent": true, "repo": "evil/repo" }` stages a row with only the title.

There is **no authentication**. The endpoint is public regardless of role and is deliberately ungated; the real access boundary is the instance's network segmentation / SSO. Deploy it accordingly.

The first-run gate is separate: while the instance has no GitHub App, every non-exempt path, including `/api/intake`, redirects to `/onboarding`. Once onboarding is complete the endpoint answers anonymously as described.

## Responses

Every `POST` response carries the open CORS headers plus `Cache-Control: no-store`.

| Status | Body                                                                    | When                                                       |
| :----- | :---------------------------------------------------------------------- | :--------------------------------------------------------- |
| `201`  | `{ "id": "<uuid>" }`                                                     | The submission was staged.                                 |
| `400`  | `{ "message": "Request body must be valid JSON" }`                       | The request body could not be parsed as JSON.              |
| `400`  | `{ "message": "Invalid intake submission", "issues": ["…", "…"] }`       | The JSON parsed but failed validation; `issues` is non-empty. |

The returned `id` is an **opaque handle for the staged row** (a UUID), not a GitHub issue number. Quote it back when triaging; nothing is created on GitHub until a triager accepts the submission.

### CORS

The endpoint is open to browser callers from any origin:

| Header                         | Value            |
| :----------------------------- | :--------------- |
| `Access-Control-Allow-Origin`  | `*`              |
| `Access-Control-Allow-Methods` | `POST, OPTIONS`  |
| `Access-Control-Allow-Headers` | `Content-Type`   |
| `Access-Control-Max-Age`       | `86400`          |

An `OPTIONS /api/intake` preflight is answered with `204 No Content` and the same headers. No credentialed requests are allowed; send the body as `Content-Type: application/json`.

## Examples

### curl

```sh
curl -X POST https://funnel.example.com/api/intake \
  -H 'Content-Type: application/json' \
  -d '{"title":"Crash when saving a board","body":"1. Open /board\n2. Drag a card\n3. See 500","source":"support-portal"}'
# {"id":"c1f0…"}
```

### JavaScript `fetch`

```js
const res = await fetch("https://funnel.example.com/api/intake", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Crash when saving a board",
    body: "1. Open /board\n2. Drag a card\n3. See 500",
    source: "support-portal",
  }),
});

if (!res.ok) {
  // 400 bodies are always JSON: `{ message }` for a parse error, or
  // `{ message, issues }` for a validation failure.
  const { message, issues } = await res.json();
  throw new Error([message, ...(issues ?? [])].join(": "));
}

const { id } = await res.json();
console.log("staged as", id);
```

## What happens next

A staged submission stays in the local database until a triager decides. The triage actions are in `src/lib/server/intake/actions.ts`:

- **Accept** creates the GitHub issue (default workflow status label `backlog`, target repository from the instance's `intake.default_repo` unless overridden) and appends a provenance footer naming the `source`.
- **Dismiss** hard-deletes the row with no GitHub mutation.
- **Duplicate** posts the submission text as a comment on an existing mirrored issue.

Every decision hard-deletes the staging row. Accept and Duplicate remove it only after GitHub confirms the write; Dismiss removes it immediately because it makes no upstream change. There is no trash bin or archive; durable history lives on GitHub once accepted.

New submissions also emit an `{"type":"intake","action":"created","id"}` event so open Inboxes refresh over SSE.

## Related

- [HTTP API reference](../../reference/http-api.md)
- [`static/openapi.yml`](../../../static/openapi.yml) — the published OpenAPI description, served at `/openapi.yml`
- [Windows intake hotkey](./windows-intake-hotkey.md)
- Source: `src/routes/api/intake/+server.ts`, `src/lib/server/intake/schema.ts`
