# Feature flags

Funnel resolves a small registry of per-browser feature flags on the server directly from the registry and the instance defaults, with browser overrides stored in a single cookie.

## Registry

The registry lives in `src/lib/features.ts` and is shared by the client and server.

| Key | Name | Registry default | Off label | On label | Surface |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `comment-bubbles` | Chat-style comments | `false` | Compact list | Chat bubbles | Renders issue comments as chat bubbles instead of a dense list. |
| `work-notes` | Internal work notes | `true` | Hidden | Visible | Shows the internal journal in the issue Inspector alongside GitHub comments. |
| `attachments` | Attachment dropbox | `true` | Hidden | Visible | Shows the attachment dropbox in the issue Inspector. |

Each registry entry also carries a description used by `/settings/features`. The key is both the registry key and the key used in the cookie.

## Resolution order

For each flag, the effective value is resolved in this order:

1. **Browser override** — the value under the flag key in the `funnel:features` cookie.
2. **Instance default** — `flagDefault(key)` in `src/lib/server/flags.ts`.
3. **Registry default** — `FeatureFlag.default`.

The instance default is environment-derived only for `comment-bubbles`; for `work-notes` and `attachments` it is the same as the registry default. There is no database setting or admin UI for feature flags.

`resolveFeatures(overrides)` builds a `{ key: boolean }` map with `overrides[key] ?? flagDefault(key)` for every registered flag. It is `async` so callers do not need to change. The result is a plain map keyed by flag name. The `(app)` layout also derives `commentBubbles` from the `comment-bubbles` entry for the Inspector.

## Environment override

| Variable | Values | Default | Effect |
| :--- | :--- | :--- | :--- |
| `FUNNEL_COMMENT_UI` | `compact`, `bubbles` | `compact` | Sets the instance default for `comment-bubbles`. `bubbles` means the instance default is on; `compact` means off. |

The value is trimmed, lower-cased and validated against the picklist. It affects only `comment-bubbles`; the other two flags have no environment override.

## Browser cookie

| Property | Value |
| :--- | :--- |
| Cookie name | `funnel:features` |
| Value | JSON object mapping flag keys to booleans, URL-encoded when written by the settings page. |
| Scope | Per browser. |
| Written by | `/settings/features` via `document.cookie`. |
| Attributes | `path=/`, `max-age=31536000`, `samesite=lax`; not HttpOnly. |
| Server read | `(app)/+layout.server.ts` and `/settings/features/+page.server.ts`. |

Parsing (`parseFeatureOverrides`):

- `decodeURIComponent` is attempted first; if it throws, the raw value is parsed.
- `JSON.parse` must yield a non-array object.
- Only keys present in the registry are retained.
- Only boolean values are retained.
- Malformed JSON, a non-object value or an array degrades to `{}`.

The settings page drops an override when the chosen value equals the instance default, and persists the remaining overrides. A cookie therefore normally contains only deviations from the instance defaults.

## Consumption

- The `(app)` layout returns the resolved `features` map to every cockpit page.
- The Inspector reads `work-notes` and `attachments` directly from the page data. Missing map entries default to visible for both.
- Comment rendering uses the `commentBubbles` convenience value, which is the resolved `comment-bubbles` flag.
- `/settings/features` shows one toggle per registry entry, using the instance defaults and the current browser's overrides.

Flags are presentation controls only. They do not gate authorisation or the API: hiding the work-notes or attachment surface does not disable the corresponding endpoints. Mutations remain governed by the session and `write` role; reads such as attachment download require `read`.

## Unknown keys and failure behaviour

- Unknown keys in the cookie are ignored.
- Non-boolean values are ignored.
- Duplicate or stale registry entries cannot break parsing; the parser always returns an object.
- A key absent from the registry resolves to `false` from `flagDefault`.
- A missing or empty `features` map in the client defaults `work-notes` and `attachments` to visible and `comment-bubbles` to the compact list.

## Related

- [Set feature flags for this browser](../how-to/configure/features.md)
- [Routes and pages](./routes-and-pages.md)
- [HTTP API](./http-api.md)
- [Glossary](./glossary.md)
