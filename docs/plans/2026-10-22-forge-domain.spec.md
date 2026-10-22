# Forge-agnostic model, slice B2 — queries, durable state and UI

## 1. DTOs and queries

`issues/types.ts` becomes forge-neutral:

- `UserRef { externalId: string; forge: string; instance: string; login: string; avatarUrl: string }`.
- `CommentItem.externalId: string` (was `githubId`).
- `MilestoneItem.url: string` (was `htmlUrl`).
- Any other read DTO that carries `htmlUrl` becomes `url`.

`issues/queries.ts` joins on internal ids (`mirrorThread.authorId = mirrorUser.id`, `mirrorRepo.id`) and selects `mirrorUser.externalId` / `forge` / `instance` for DTOs, `mirrorThread` instead of `mirrorIssue`, `mirrorThreadLabel`/`mirrorThreadAssignee`, and `mirrorMilestone.url`. `issues/filters.ts` takes repo refs with an internal `id`, a string `viewerExternalId`, and uses the renamed tables.

## 2. Viewer, durable state and API routes

`getViewerGithubId` becomes `getViewerExternalId` and returns the Better Auth account id as a string. `locals.viewerGithubId` becomes `locals.viewerExternalId`. `resolveViewerRef` returns a `UserRef` with `externalId`, `forge` and `instance`.

Attachments and work notes store `uploaded_by_external_id` / `author_external_id` plus forge and instance, and reconstruct `UserRef` with those fields. The `/api/mirror/issues` routes pass `repo.id` (internal). The settings people page matches Better Auth account ids as strings against `mirrorUser.externalId`.

## 3. UI and client

Every `person.githubId` / `viewer.githubId` / `comment.githubId` becomes `externalId`; the viewer value is a string. Read-DTO `htmlUrl` becomes `url`. Write responses keep their existing shape in this slice (`htmlUrl`) so the mutation contract does not change; a later cleanup can rename it.

## 4. Verification

`bun run check` is clean, the full suite is green, and no `githubId`/`mirrorGithub` remains in `src/` or `tests/`. `git grep github_id` is limited to the old migration folder.
