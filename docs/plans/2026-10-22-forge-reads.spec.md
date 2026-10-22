# Forge transport, slice 2 — assignees and milestones

## 1. Assignable users

`listRepoAssignees` takes a `GitHubProvider` and walks `provider.repos.assignableUsers(ref)` instead of `GET /repos/{owner}/{repo}/assignees`. It maps each `Actor` to the mirror's `UserRecord`: `githubId` is `Number(actor.id)`, `login` is `actor.login`, `avatarUrl` is `actor.avatarUrl ?? ""`. An actor whose id is not a finite integer is skipped, matching the old guard.

`sync/worker.ts`'s `refreshRepoAssignees` obtains the provider with `forge.installationProvider(installationId)`; its behaviour and the replace-wholesale mirror write stay the same.

## 2. Milestones

`listRepoMilestones` takes a `GitHubProvider` and uses the raw escape hatch, because `forges`' `Milestone` drops the counts, creator and timestamps the cockpit needs. It sends `GET /repos/{owner}/{repo}/milestones` with `{ state: "all", sort: "due_on", direction: "desc", per_page: 100, page }` and maps the response with the existing `toRepoMilestone`. Pagination is unchanged: keep reading while a page is full.

`sync/worker.ts`'s `refreshRepoMilestones` obtains the provider with `forge.installationProvider(installationId)`. `createRepoMilestone` stays on Octokit in this slice because its caller is the unported write path.

## 3. Coexistence

`octokit` remains for writes, sync polling, hydration, conflicts, the users route and the passthrough. No schema, DTO, route or settings change. The full suite stays green.
