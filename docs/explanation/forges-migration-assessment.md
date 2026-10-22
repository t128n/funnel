# Moving Funnel off Octokit with `forges`

Status: research note. No code changed.

Question: can Funnel replace `octokit` with [`forges`](https://forges.link) so it stops depending on GitHub, and what would that take?

## Verdict

The client swap is feasible and mostly mechanical. `forges` covers every GitHub operation Funnel uses today, and it exposes two escape hatches (`provider.request()` and GitHub `provider.graphql()`) for the parts it does not model.

But replacing Octokit does **not** make Funnel independent of GitHub. Octokit is a thin transport dependency: it is imported at runtime in one file (`src/lib/server/github/app.server.ts`) and only as a type in four others. The actual coupling is the product model:

- onboarding creates a GitHub App through the manifest flow, and sign-in is GitHub OAuth;
- the mirror schema is `mirror_*` with text external ids scoped by `forge`/`instance`, plus GitHub node ids;
- the public `/api/repos/...` surface returns raw GitHub REST bodies verbatim;
- the domain and UI use `owner/repo`, `externalId`, `url` and GitHub issue numbering.

So there are two projects, not one:

| Project | Scope | Rough effort (one dev, familiar with the code) |
| :--- | :--- | :--- |
| A. Replace Octokit with `forges`, keep GitHub-only behaviour | transport + tests | 1–2 weeks |
| B. Make Funnel forge-agnostic | schema, onboarding, auth, API, UI, parity | 4–8 weeks on top of A |

Recommendation: do A as a spike first (it is independently useful — smaller dependency, built-in fake for tests), and only commit to B if hosting a second forge is a real near-term goal. If it is, fold A into B and stage them as below.

## What `forges` is

- `forges@0.2.0`, MIT, by Daniel Roe (`github.com/danielroe/forges`), under active development (npm metadata updated 2026-10-19).
- ESM only, zero runtime dependencies, global `fetch`, Node ≥ 22.18 (Bun is fine).
- 11 forges plus Cloudflare Artifacts: GitHub, GitLab, Bitbucket Cloud, Forgejo, Gitea, Gitee, Azure DevOps, Cursor Origin, Pushin.eu, Tangled, Sourcehut.
- One normalised data model (`RepoRef`, `ThreadRef`, `Thread`, `Comment`, `Label`, `Milestone`, `Actor`), capability flags per forge, keys (`repoKey()`, `threadKey()`), pagination cursors with ETag support, webhook ingestion, and an in-memory `forges/fake` for tests.
- GitHub specifics: GitHub App auth (app id + private key + installation id), GHES `baseUrl`, typed `graphql()`, token kinds (`classic`, `fine-grained`, `app-user`, `installation`).

Docs: `https://forges.link/llms.txt`, full text at `/llms-full.txt`. The package is also inspectable via `bun info forges`.

## What maps cleanly

| Funnel today | `forges` equivalent | Notes |
| :--- | :--- | :--- |
| `app.getInstallationOctokit(id)` | `github({ auth: { type: 'app', appId, privateKey, installationId } })` | Provider caches installation tokens internally. |
| `GET /repos/{o}/{r}/installation` | `installations.list()` + `installations.provider()` / `installations.repos()` | Funnel caches repo → installation; either iterate installations or keep a raw `request()` for the lookup. |
| `GET /app/installations` | `installations.list()` | Includes account login and id. |
| `GET /installation/repositories` | `installations.repos(id)` | Paginated. |
| `GET /repos/{o}/{r}/issues` + `If-None-Match` | `threads.list(repo, { kind: 'issue', state, since, sort, direction, cursor: { etag } })` | `Page` has `etag`, `notModified`, `cursor`, `rateLimit`, `warnings`. |
| GraphQL `nodes(ids:)` hydration | `threads.getMany(refs)` (→ `GetManyResult[]`) or `provider.graphql(HYDRATE_QUERY, { ids })` | `getMany` batches where the forge allows and reports per-item warnings. GitHub `graphql()` keeps the existing one-request hydration including comments. |
| Better Auth token refresh (`getUserAccessToken`) | `auth: { type: 'token', token: () => getUserAccessToken(userId) }` | The function is called before every request, so refresh stays in Better Auth. |
| `GET /issues/{n}/timeline` (label events) | `threads.events(ref)` → `EventDetail { type: 'label', label }` | Enough for latest-label-wins conflict repair; verify event ordering on GitHub. |
| `POST /issues` | `threads.create(repo, { kind: 'issue', title, body, labels?, assignees? })` | Returns normalised `Thread`. |
| `PATCH /issues/{n}` | `threads.update(ref, { title, body, state, labels, assignees })` | One call where supported. |
| `threads.close` with `state_reason` | `threads.close(ref, { reason: 'completed' \| 'not_planned' \| 'duplicate' })` | `reasonRaw` for the native value. |
| `PUT /issues/{n}/labels` | `threads.setLabels(ref, names)` | Returns resulting labels. |
| `DELETE /issues/{n}/labels/{name}` | `threads.removeLabels(ref, [name])` | Idempotent. |
| `POST /issues/{n}/comments` | `threads.createComment(ref, body)` | Returns `Comment`. |
| `GET /repos/{o}/{r}/labels` | `repos.labels(repo)` | Normalised `Label { name, colour, description }`. |
| `POST /repos/{o}/{r}/labels` | `repos.createLabel(repo, { name, colour, description })` | — |
| `GET /repos/{o}/{r}/assignees` | `repos.assignableUsers(repo)` | — |
| `GET /repos/{o}/{r}/milestones` | `repos.milestones(repo)` | List only, and a reduced shape; see gaps. |
| `GET /users/{login}` | `users.get(login)` | — |
| `webUrl(path)` | `provider.urlFor({ repo })` / `provider.urlFor({ thread })` + `provider.webOrigin` | No string concatenation of instance URLs. |
| Octokit error `{ status }` | typed `ForgeApiError` / `NotFoundError` / `ForbiddenError` / `RateLimitedError` | Better than parsing Octokit errors. |
| Fetch stubs in tests | `forges/fake` or recorded fixtures | Removes most Octokit-shape fixtures. |

## Gaps that stay GitHub-specific

| Funnel need | `forges` | Workaround |
| :--- | :--- | :--- |
| GitHub App **manifest** creation + code exchange (`/settings/apps/new`, `/app-manifests/{code}/conversions`) | Not supported | Keep the existing raw flow; it is GitHub onboarding, not API transport. |
| GitHub **OAuth** authorization URL + token exchange/refresh (Better Auth) | Not supported; `forges` only consumes tokens | Keep Better Auth's GitHub provider, or move to PAT/token onboarding. |
| `PATCH /repos/{o}/{r}/labels/{name}` (canonical label drift repair) | No `repos.updateLabel` | `provider.request()` for GitHub; upstream a `repos.updateLabel` / `deleteLabel` capability. |
| `POST /repos/{o}/{r}/milestones` (lazy milestone creation) | `repos.milestones()` lists only; `threads.setMilestone()` needs an existing milestone | `provider.request()` for GitHub; upstream `repos.createMilestone`. |
| Milestone `number`, `open_issues`, `closed_issues`, creator, created/updated/closed timestamps (Milestones view, progress, DB identity) | `Milestone` has `id`, `title`, `state`, `description`, `dueOn`, `url` only | Keep the milestone read on `provider.request()` for GitHub, or upstream the fields. Losing the counts is a visible product regression. |
| Raw GitHub REST passthrough at `/api/repos/...` | Normalised model only; `provider.request()` can proxy but returns unnormalised bodies | Keep as a documented GitHub-only compatibility surface, or replace it with the normalised `/api/mirror/...` routes. |
| GraphQL hydration | Only the **GitHub** provider has `graphql()` | Keep a GitHub branch for hydration; other forges use `threads.getMany` + `threads.comments` (more requests). |
| `html_url`, `node_id`, `databaseId`, `external_id` in responses and DB | Model uses `url`, `ref.externalId`, keys | Schema/domain refactor. |
| Issues and PRs share numbering | Not true on every forge | Thread refs carry `kind` + `number`; PR-specific code must branch on kind. |

## Where the real coupling is

1. **Onboarding** — `src/routes/onboarding/*`, `src/lib/server/github/manifest.ts`, `manifest-flow.server.ts`. Creates a GitHub App, stores `state_github_app`, redirects through install. There is no cross-forge equivalent; other forges need a different onboarding path (token, OAuth app, or app installation where the forge has one).
2. **Sign-in** — `src/lib/server/auth/index.ts:83-101` registers Better Auth's `github` provider with `read:user` + `repo`. The identity, account id and token refresh are GitHub-specific. Forge-agnostic auth is a separate project.
3. **Mirror schema** — `src/lib/server/db/schema.ts`: `mirror_repo/user/milestone/thread/repo_label/thread_label/thread_assignee/repo_assignee/comment`, plus `state_work_note.author_external_id` and `state_attachment.uploaded_by_external_id`. The forge-neutral schema now carries `forge` + `instance` + `external_id` and `url`.
4. **HTTP API** — `src/routes/api/repos/**` and `src/lib/server/github/api-passthrough.server.ts` deliberately proxy GitHub REST verbatim, including `Link` rewriting, `pull_request` filtering, ETag cache and GitHub rate-limit headers. A multi-forge API cannot keep that contract.
5. **Domain and UI** — `issues/types.ts` (`externalId`, `RepoMilestoneRef`, `url`), `lib/issue-url.ts`, `lib/issue-ref.ts`, `server/viewer.ts`, settings validation (`owner/name` regex), and every hard-coded `github.com` link.
6. **Sync** — `sync/worker.ts`, `hydrate.ts`, `conflicts.ts`, `mirror.ts` assume GitHub REST + GraphQL node ids, `since`, ETag-as-304 and timeline label events. The algorithm ports, but the shapes and the tests do not.

## DX comparison: `forges` vs Octokit

Short answer: **yes, `forges` is a DX improvement for Funnel's domain code — but not uniformly, and not mainly because it is "not Octokit".** The gain comes from replacing hand-rolled GitHub domain mapping with a typed domain SDK. Where Funnel needs GitHub-shaped output (manifest, OAuth, passthrough, milestone counts), `forges` is neutral or worse.

Octokit is a typed HTTP client for one forge's raw API. `forges` is a normalised domain SDK for many forges. Funnel currently sits on the first and writes the second by hand. Moving that layer into a library is the actual DX change.

### Where the code gets clearly better

**Pagination and snake_case mapping.** Today every listing repeats the same loop, casts the body and renames fields. `labels.ts`, `assignees.ts`, `milestones.ts` and `conflicts.ts` each have their own copy, plus their own `Rest*` interface.

```ts
// before — src/lib/server/github/assignees.ts
for (let page = 1; ; page++) {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/assignees",
    { owner, repo, per_page: PER_PAGE, page })
  const items = data as unknown as RestAssignee[]
  for (const item of items) {
    all.push({ externalId: String(item.id), login: item.login, avatarUrl: item.avatar_url ?? "" })
  }
  if (items.length < PER_PAGE) break
}

// forges
for await (const actor of provider.repos.assignableUsers(repo)) {
  all.push({ externalId: actor.id, login: actor.login, avatarUrl: actor.avatarUrl ?? "" })
}
```

The `RestAssignee` interface, the cast and the `avatar_url` rename all disappear. The same collapse applies to labels, milestones and threads.

**ETag polling.** Today the worker hand-builds `If-None-Match`, reads the `etag` header, and treats a thrown 304 as success — with a custom `IssuesPage | NotModified` union and a `statusOf()` helper repeated across modules.

```ts
// forges
const page = await provider.threads
  .list(repo, { kind: "issue", state: "all", since, sort: "updated",
                direction: "asc", perPage: 100,
                cursor: etag ? { etag } : undefined })
  .page()

if (page.notModified) return
etag = page.etag
```

That removes the 304-as-error idiom (Octokit's least obvious behaviour), the header parsing and one custom error helper. The derived-cursor and pruning logic stays, because it is Funnel's, not GitHub's.

**Auth plumbing.** `app.server.ts` currently needs `App` plus a pre-defaulted `Octokit` class to make GHES `baseUrl` work, a manual `auth({ type: "app" })` JWT mint for app-level calls, separate installation/user clients, and a comment explaining that `@octokit/graphql` rewrites `/api/v3` to `/api/graphql`.

```ts
// forges
const installation = github({ baseUrl, auth: { type: "app", appId, privateKey, installationId } })
const asUser = github({ baseUrl, auth: { type: "token", token: () => getUserAccessToken(userId) } })
```

Provider construction, token caching, refresh and the GHES GraphQL URL all move inside the library. This is the single biggest reduction in "library plumbing" code.

**Writes return the domain object.** Today a mutation PATCHes, then separately PUTs labels, then casts `{ html_url }` out of both responses. `threads.update(ref, { title, body, state, labels, assignees })` returns a `Thread` with `url`, `labels` and `assignees`, and `threads.close(ref, { reason })` models `state_reason` explicitly. Fewer round trips and fewer partial-failure paths.

**Errors.** One typed hierarchy (`NotFoundError`, `ForbiddenError`, `RateLimitedError`, `UnsupportedOperationError`) instead of `"status" in error` checks copied into `worker.ts`, `labels.ts`, `app.server.ts`, `api-passthrough.server.ts` and `http/outcome.ts`. Funnel still maps them to HTTP statuses once, but the knowledge is centralised.

**Tests.** Fake `request(route, params)` clients and fetch stubs keyed to GitHub payloads are replaced by `forges/fake`:

```ts
const forge = fake({ seed: { threads: [{ repo: "acme/widgets", kind: "issue", title: "Crash" }] } })
// ... exercise the code ...
expect(forge.store.events).toContainEqual(expect.objectContaining({ kind: "comment" }))
```

This is a large readability win for the sync and mutation suites, but it is a rewrite, not a free lunch.

**Multi-forge routing, when it matters.** `createForges()`, `forges.for(ref)`, `parseUrl()` and `urlFor()` remove code Funnel would otherwise write for a second forge: provider selection, URL parsing, link building, key derivation, capability checks.

### Where it is neutral or worse

- **Full GitHub surface.** Octokit's types cover all of GitHub's REST and GraphQL API; `forges` covers the normalised subset. For Projects v2, issue types beyond what the model exposes, rulesets, deployments or exotic search qualifiers, you fall back to `provider.request()` or `graphql()`, which are untyped relative to Octokit's route map.
- **GitHub-specific debugging.** Octokit's `"GET /repos/{owner}/{repo}/issues"` maps 1:1 to GitHub's docs and request logs. `provider.threads.list()` is nicer to read but adds a translation step when you need to know exactly what was sent. `onRetry`/`onRateLimit` and `raw` fields help, but this is a small regression for GitHub-only work.
- **Missing model fields.** Milestone counts/creator/timestamps and raw `html_url`/`node_id` are gone from the typed model. Funnel's Milestones view and its raw API now need escape hatches, so the "one clean API" story is only partly true.
- **Sync hydration.** `Thread` has no comments, so `threads.getMany()` alone does not replace the current one-request GraphQL hydration. Keeping `provider.graphql(HYDRATE_QUERY)` preserves performance but keeps a GitHub-only branch — which is honest, but means the sync path is not actually cross-forge.
- **Ecosystem and maturity.** Octokit is ubiquitous, battle-tested and heavily documented; `forges` is 0.2.x with a smaller community. Fewer answers when something goes wrong, and a higher chance of API churn.
- **Cognitive load for contributors.** A GitHub-familiar contributor can read Octokit calls immediately. `forges` adds refs, keys, capabilities and a provider registry. That is a good trade for a multi-forge codebase and a mild tax for a GitHub-only one.

### Scorecard

| Dimension | Verdict |
| :--- | :--- |
| Domain reads (`issues`, `labels`, `assignees`) | Better |
| Domain writes (`create`, `update`, `close`, comments) | Better |
| Pagination | Better |
| Conditional polling / ETag | Better |
| Auth (app, installation, user token) | Better |
| Error handling | Better |
| Tests | Better after rewrite |
| Type safety for the normalised model | Better |
| Type safety for the full GitHub API | Worse |
| GitHub-specific debugging | Slightly worse |
| Milestones, manifest, OAuth, raw REST passthrough | Worse or unchanged |
| Ecosystem maturity | Worse |
| Onboarding a new contributor | Neutral to slightly worse |
| Dependency footprint | Better (zero runtime deps) |

**Net:** a real DX improvement, concentrated in the 60–70% of the code that is domain mapping, pagination and tests. The remaining 30–40% — onboarding, OAuth, raw passthrough, milestone fidelity — is where you will write escape-hatch code and feel the abstraction leak. If Funnel stays GitHub-only, the net gain is modest and mostly about deleting boilerplate. If Funnel adds a second forge, the same change becomes a large gain, because that boilerplate would otherwise be duplicated per forge.

## Migration shape

### Phase 0 — spike (1–2 days)

Replace `app.server.ts` with a provider factory and port `labels.ts`, `milestones.ts`, `assignees.ts` and `users/[username]`. Keep the sync worker on Octokit. Goal: prove app auth, GHES base URL, error mapping and the label/milestone raw-request gaps on a real App installation.

### Phase A — transport swap, GitHub parity (1–2 weeks)

1. `app.server.ts` → `github()` provider cache keyed by installation id; user provider from a Better Auth token function. Token kind follows the prefix: a GitHub App OAuth token is `ghu_` (`app-user`), a classic OAuth token is `gho_` (`classic`); omit `kind` and let the provider read the prefix.
2. Port `issues/mutations.ts`, `intake/actions.ts`, `sync/worker.ts`, `sync/hydrate.ts`, `sync/conflicts.ts`.
3. Keep `provider.graphql(HYDRATE_QUERY)` for batched hydration, and `provider.request()` for `PATCH label` and `POST milestone`.
4. Port `api-passthrough.server.ts` to `provider.request()` (success/error/headers), keeping the GitHub REST contract.
5. Replace Octokit shapes in tests with `forges/fake`; delete `octokit` from `package.json`.
6. Exit criteria: all tests green, no `octokit` import, identical HTTP behaviour.

### Phase B — forge-neutral domain (2–4 weeks)

1. Schema: add `forge` and `instance` to mirror and durable state; use text `external_id`; add `url`; build the forge-neutral `mirror_*` tables (implemented).
2. Domain: `UserRef` carries `externalId` + `forge` + `instance`; `Thread`/`Repo` refs instead of `owner/name`; `url` instead of `htmlUrl`.
3. Queries and routes: `/api/...` carries `forge`/`instance`; `parseUrl()` for pasted links; `urlFor()` for links.
4. Sync: feature-detect with `provider.can(verb, kind)`; fall back to `threads.getMany` + `comments` where `graphql()` is unavailable.
5. Tests: query/route tests move to `forges/fake`.

### Phase C — onboarding and auth for more than GitHub (1–2 weeks)

1. Keep the GitHub App manifest flow as the GitHub path.
2. Add token-based onboarding per forge (PAT or OAuth app), stored encrypted like `state_github_app`; bot writes use that token.
3. Either keep GitHub OAuth as the only sign-in (GitHub remains the identity provider) or add per-forge auth. **Decide this explicitly** — it determines whether "not dependent on GitHub" is true for users, not just for API calls.

### Phase D — HTTP API and UI (1 week)

1. Decide: keep `/api/repos/...` as a GitHub-only compatibility API, or deprecate it in favour of the normalised mirror routes.
2. Replace hard-coded `githubUrl`/`html_url` with provider URLs; show the forge in repo pickers and badges.
3. Update docs (`architecture.md`, `sync-and-mirror.md`, `http-api.md`, `database-schema.md`).

Total: ~4–8 weeks for B+C+D, with A folded in. Adding a second forge (GitLab is the closest fit) then costs another 1–2 weeks of parity work and testing.

## Risks

- **0.x churn.** `forges` is at 0.2.0 and evolving quickly. Pin an exact version and keep it behind Funnel's own adapter so upstream changes are contained.
- **Two escape hatches keep GitHub in the code.** `graphql()` and raw `request()` are pragmatic, but every use is a place where the abstraction leaks. Count them and keep them in one `github-only` module.
- **Missing label/milestone writes.** Until `repos.updateLabel` and `repos.createMilestone` exist, those paths use raw requests. Contribute them upstream; they are small.
- **Comment hydration cost.** Without GraphQL, mirroring comments becomes one request per changed issue. On busy repos this changes the rate-limit profile materially.
- **SQLite migration.** Renaming/reshaping the mirror tables while keeping durable state keyed by `owner/name` needs a careful migration and a rollback plan; the mirror is disposable, but `state_*` is not.
- **Product scope.** A forge-agnostic Funnel is a different product: onboarding, identity, permissions, URL model and settings all change. Do not treat it as a library swap.

## Recommendation

1. **If a second forge is not funded:** do not migrate yet. Instead extract a narrow `ForgeClient` interface inside `src/lib/server/github/` (provider factory, `thread`, `repo`, `labels`, `milestones`, `assignees`, raw request), move the Octokit types behind it, and normalise the mirror schema in a follow-up. That is ~1 week and makes the `forges` swap a later, mechanical change.
2. **If a second forge is the goal:** run Phase 0 now, then commit to A + B + C. Use `forges` as the client, but budget the majority of the work for schema, onboarding and auth — not for the API calls.
3. **Do not** present `forges` as the thing that removes the GitHub dependency. It removes the Octokit dependency; the GitHub-shaped product decisions are the actual lock-in.

## Progress

As of 2026-10-22, **Phase A (transport swap) is implemented** on `superlite/forge-migration`:

- `octokit` is removed from `package.json` and from every source/test import.
- `src/lib/server/forge/providers.server.ts` is the only provider factory (app, installation and user providers, GHES-aware instance, installation-id cache, refs, web URLs).
- Labels, assignees, milestones, issue writes, intake, sync polling, hydration, conflicts and the raw passthrough run on `forges`.
- `app.server.ts` is reduced to `installationErrorResponse`; GraphQL hydration still uses GitHub's `provider.graphql()`.
- Verification: 501 tests pass, `svelte-check` reports 0 errors/0 warnings, and the adapter-node build succeeds with the usual environment variables.

**Phase B (schema and domain) is also implemented:**

- The mirror is `mirror_repo` / `mirror_user` / `mirror_milestone` / `mirror_thread` / `mirror_comment` plus the label and assignee junctions. Repos and users have internal integer ids plus `forge` / `instance` / `external_id`; threads carry `kind`, `external_id` and `url`.
- `state_work_note` and `state_attachment` store `author_external_id` / `uploaded_by_external_id` plus forge and instance. The migration drops the disposable GitHub mirror and rebuilds these durable tables with copied ids.
- DTOs use `UserRef.externalId` (string), `CommentItem.externalId` and `MilestoneItem.url`; the viewer is a string external id; UI keys and comparisons use `externalId`.
- Verification: 511 tests pass, `svelte-check` reports 0 errors/0 warnings, and the adapter-node build succeeds. No `githubId` or `mirrorGithub` remains in `src/` or `tests/`.

GitHub App manifest onboarding, GitHub OAuth sign-in and `/api/repos/...` mirroring GitHub REST remain; Phases C–D are still open. The write responses still call their link `htmlUrl`, and `resolveViewerRef` hardcodes `github.com` when looking up the mirrored profile, so a GHES viewer falls back to the Better Auth profile. The final review of the transport slice raised two issues that were fixed (rate-limit reset metadata on passthrough errors; partial-write reporting) and three accepted as known gaps: `forges` error objects carry no response headers beyond `RateLimit`, `updateIssue` can partially apply across several requests, and the sync fakes are not yet backed by recorded real-forge fixtures.

## Sources

- [`forges` documentation index](https://forges.link/llms.txt) and [full text](https://forges.link/llms-full.txt)
- [GitHub provider](https://forges.link/providers/github) — app auth, GHES, token kinds, GraphQL, capabilities
- [Issues and pull requests reference](https://forges.link/reference/threads) — `threads.*`
- [Repositories reference](https://forges.link/reference/repositories) — `repos.*`, `installations.*`, `users.*`
- [Requests and pagination](https://forges.link/reference/requests) — ETag, cursors, raw `request()`
- [Capability matrix](https://forges.link/reference/capability-matrix)
- [Work with several forges](https://forges.link/guides/multiple-forges) — `createForges()`, `parseUrl()`, `urlFor()`
- npm: `forges@0.2.0`, MIT, zero runtime dependencies
