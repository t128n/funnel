# Existing GitHub issue index (audit reference)

Snapshot taken 2026-11-04 from `gh issue list --repo t128n/funnel --state all --limit 200` (61 issues).

| Issue | State | Title | Labels |
| --- | --- | --- | --- |
| #100 | OPEN | bug(board): kanban does not fill 100dvh and is cut off at the bottom | todo |
| #99 | OPEN | chore(ui): remove the repository scope dropdown from the app bar | todo |
| #98 | CLOSED | feat(ui): Adopt approved Bootstrap Composition A across Funnel | enhancement |
| #79 | OPEN | feat(milestones): show the milestone due date in the inspector | enhancement, todo, p3, sm, mod, low |
| #69 | CLOSED | chore(issues): dedupe the label-group helper | |
| #68 | CLOSED | chore(deps): remove unused @internationalized/date | |
| #67 | CLOSED | chore(notifications): delete Wave-0 stubs | |
| #66 | CLOSED | chore(labels): delete dead label-option exports | |
| #65 | CLOSED | chore(priority): delete dead exports | |
| #64 | CLOSED | refactor(api): share the repo GET handler | |
| #63 | CLOSED | refactor(flags): drop the OpenFeature wrapper | |
| #62 | CLOSED | refactor(feeds): share feed-route boilerplate | |
| #61 | CLOSED | chore(board): delete Chip and DnD leftovers | |
| #60 | CLOSED | chore(ui): delete unused shadcn-svelte primitives | |
| #53 | OPEN | feat(labels): make the reserved label vocabulary configurable | enhancement, in-progress, md, mod, low |
| #50 | CLOSED | feat(ui): copy an issue thread from the inspector (select-all and copy-as-Markdown) | enhancement, in-progress, p3, md |
| #47 | CLOSED | feat(priority): derive priority from impact × urgency and retire the p1/p2/p3 labels | enhancement, in-progress, p1, lg |
| #46 | CLOSED | feat(triage): define impact and urgency scales with documented scoring rules | enhancement, todo, p1, md |
| #43 | OPEN | feat(api): expose read/write issue APIs and outbound webhooks | enhancement, todo, p3, lg |
| #42 | OPEN | feat(intake): add rate limiting and anti-spam controls for public submissions | enhancement, backlog, p3, md |
| #41 | OPEN | feat(intake): suggest duplicates and add source-based routing rules | enhancement, backlog, p3, lg |
| #40 | OPEN | feat(intake): add attachments and optional reporter contact | enhancement, backlog, p3, lg |
| #39 | OPEN | feat(github): support GitHub issue types in filters, detail, and grouping | enhancement, backlog, p3, md |
| #38 | OPEN | feat(sync): add a GitHub webhook receiver for near-real-time updates | enhancement, backlog, p3, lg |
| #37 | OPEN | feat(automation): add SLA and stale-triage reminder rules | enhancement, backlog, p3, md |
| #36 | OPEN | feat(insights): add triage analytics for inbox age, time-to-triage, throughput, and WIP | enhancement, backlog, p3, md |
| #35 | OPEN | feat(history): mirror GitHub timeline events and add local triage audit history | enhancement, backlog, p3, lg |
| #34 | OPEN | feat(issues): mirror parent/sub-issue and blocked-by relationships | enhancement, backlog, p3, lg |
| #33 | OPEN | feat(ops): surface sync health and degraded repositories in settings | enhancement, todo, p2, sm |
| #32 | OPEN | feat(triage): add a needs-info/waiting state with stale detection | enhancement, todo, p2, md |
| #31 | CLOSED | feat(milestones): surface milestones in detail, filters, and grouping | enhancement, todo, p2, sm |
| #30 | OPEN | feat(inbox): add bulk selection and bulk triage actions | enhancement, todo, p2, md |
| #29 | OPEN | feat(comments): support edit, delete, reactions, and mentions | enhancement, todo, p2, md |
| #28 | OPEN | feat(github): show linked pull requests, reviews, and checks on issues | enhancement, todo, p2, lg |
| #27 | CLOSED | feat(notifications): add a notification center with unread state and watching | enhancement, todo, p2, lg |
| #26 | OPEN | feat(views): add named, shareable saved views | enhancement, todo, p2, md |
| #25 | OPEN | feat(ui): add a command palette and keyboard navigation for issue lists | enhancement, todo, p2, lg |
| #24 | CLOSED | fix(attention): surface blocked issues that have no re-check date | bug, todo, p1, sm |
| #23 | OPEN | feat(filters): add unassigned/blocked filters and selectable sorting | enhancement, todo, p1, md |
| #22 | CLOSED | perf(feeds): paginate and virtualize issue, inbox, and board lists | enhancement, todo, p1, lg |
| #21 | OPEN | feat(search): add FTS5, issue identifiers, and filter qualifiers | enhancement, todo, p1, lg |
| #20 | OPEN | feat(inbox): add snooze/defer for submissions and untriaged issues | enhancement, todo, p1, md |
| #19 | OPEN | feat(inbox): complete triage decisions (status, assignee, labels, dismiss reason, undo) | enhancement, todo, p1, lg |
| #18 | OPEN | feat(issues): add an in-app quick-create issue dialog | enhancement, todo, p1, lg |
| #17 | CLOSED | fix(sync): paginate issue comments and reconcile deletions | bug, todo, p1, md |
| #16 | OPEN | bug(ui): feed search is still too narrow to read on /issues (cause changed after #78) | bug, todo, p2, sm |
| #15 | OPEN | chore(brand): favicon, webmanifest and error page still use the pre-pivot #3574f0 | bug, todo, p3, sm |
| #14 | CLOSED | bug(board): kanban column lists do not scroll — long lanes are clipped | bug, in-progress, p1, sm |
| #13 | OPEN | docs: replace the leftover `sv` scaffold text in README.md | documentation, todo, p3, sm |
| #12 | OPEN | chore(logging): verify structured logging across every background cycle | enhancement, todo, p3, sm |
| #11 | OPEN | test: add GitHub Enterprise Server (GHE) coverage | enhancement, todo, p3, md |
| #10 | OPEN | test: enforce a coverage threshold on core business logic | enhancement, todo, p3, sm |
| #9 | OPEN | fix(intake): finish and verify the Windows intake hotkey tool | bug, todo, p2, lg |
| #8 | OPEN | test: cover the release-phase migration CLI and migrations-folder resolution | enhancement, todo, p2, sm |
| #7 | OPEN | docs: document backup/restore, upgrade, and rollback for the data directory | documentation, todo, p2, md |
| #6 | OPEN | deploy: add a Linux systemd unit and bare-metal deployment docs | documentation, enhancement, todo, p3, md |
| #5 | OPEN | release: publish the executable and container image from a tagged release | enhancement, todo, p2, lg |
| #4 | OPEN | build: support and test arm64 standalone and container images | enhancement, todo, p3, md |
| #3 | OPEN | test: smoke-test the container (build, run, healthcheck, volume persistence, restart) | enhancement, todo, p2, md |
| #2 | OPEN | test: smoke-test the standalone executable (boot, --migrate, --healthcheck, /readyz) | enhancement, todo, p2, sm |
| #1 | OPEN | ci: add a GitHub Actions workflow that runs `mise run verify` | enhancement, todo, p2, sm |

Notes:

- #16 and #99 describe the pre-migration UI (`FeedSearch`, split list/detail, Filters popover). They must be re-verified against the current Composition A implementation before being cited as duplicates.
- #100 is explicitly about the current Composition A board and should still reproduce.
- Issues with `todo` are the only plausible labels for audit findings; there is no `ux` or `a11y` label in this repository.
