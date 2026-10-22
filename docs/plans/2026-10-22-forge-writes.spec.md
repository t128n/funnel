# Forge transport, slice 3 — writes and intake

## 1. Write client

`issues/http.ts` returns a `forges` `GitHubProvider` built with `forge.userProvider(token)` instead of an Octokit client. `AuthResult` becomes `{ ok: true; provider: GitHubProvider }`. Every issue write route passes `provider` to the mutation layer. The HTTP request and response bodies do not change.

## 2. Issue mutations

`issues/mutations.ts` takes a `GitHubProvider` in every input. It uses the normalised thread operations:

- create: `threads.create(repoRef, { kind: "issue", title, body, labels, assignees })`; `number` is `Number(thread.ref.number)`, `htmlUrl` is `thread.url ?? ""`.
- update: `threads.update` for title/body/assignees/state, `threads.close(ref, { reason })` when closing with a reason, `threads.setMilestone` for the milestone, `threads.get` to read the current labels, and `threads.setLabels` for the reserved-label replacement.
- labels: `threads.setLabels` / `threads.removeLabels`.
- comments: `threads.createComment`; `id` is `Number(comment.id)`, `htmlUrl` is `comment.url ?? ""`.
- milestones: `createRepoMilestone(provider, owner, repo, input)` uses `provider.request("POST", "/repos/{owner}/{repo}/milestones", { body })` and the existing raw `toRepoMilestone` mapping.

`errorStatus` keeps reading a numeric `error.status`, which both `ForgeApiError` and Octokit provide. The partial-failure order may differ from the single PATCH: field edits happen first, then state, milestone and reserved labels. A failure still returns `Outcome` rather than throwing.

## 3. Routes and intake

Every route that passed `auth.octokit` passes `auth.provider`. The intake actions take a `GitHubProvider` and use `threads.create` and `threads.createComment`. The inbox page action passes `auth.provider`.

## 4. Coexistence

Sync polling, hydration, conflicts, the users route and the raw passthrough stay on Octokit in this slice. No schema, DTO, settings or UI change. The full suite stays green.
