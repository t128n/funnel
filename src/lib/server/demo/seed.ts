/**
 * Idempotent demo seed (task T2).
 *
 * `bun run dev:demo` starts the dev server against a database seeded with a
 * believable cockpit: two mirrored repositories, a signed-in admin, and enough
 * durable state (intake, notifications, notes, planning, actuals) for every
 * view to render. The seed writes only to the normal `state_*`, `auth_*` and
 * `mirror_*` tables — there is no demo-only table.
 *
 * The completed pass is recorded as `state_setting["demo.seeded"]`, written
 * last. An existing marker returns `{ seeded: false }` immediately, so edits
 * made in the demo survive a dev-server restart. Delete `data/demo.db*` to
 * reset.
 *
 * Nothing here performs a network call.
 */
import { generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { FUNNEL_URL } from "$app/env/private";
import { CANONICAL_LABELS } from "#lib/labels";
import {
  writeBlocked,
  writeEpicChildren,
  type BlockWriteInfo,
} from "#lib/funnel-metadata";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authSession,
  authUser,
  stateIntakeSubmission,
  stateIssueDelay,
  stateIssueEvent,
  stateNotification,
  stateSetting,
  stateWorkNote,
} from "#lib/server/db/schema";
import {
  getGithubCredentials,
  saveManifestCredentials,
  setInstallationId,
} from "#lib/server/github/credentials";
import { setPlanItem } from "#lib/server/planning/store";
import {
  DEFAULT_ALLOCATION_PERCENT,
  DEFAULT_CYCLE_ANCHOR,
  DEFAULT_CYCLE_WEEKS,
  DEFAULT_SIZE_MINUTES,
  writeSettings,
  type MaintainerInput,
} from "#lib/server/settings/store";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import {
  replaceRepoAssignees,
  replaceRepoLabels,
  replaceRepoMilestones,
  upsertIssues,
  upsertRepo,
  type IssueRecord,
  type MilestoneRecord,
  type RepoLabelRecord,
  type StoredMetadata,
  type UserRecord,
} from "#lib/server/sync/mirror";
import {
  DEMO_EXTRA_LABELS,
  DEMO_FORGE,
  DEMO_INSTANCE,
  DEMO_REPO_SLUGS,
  DEMO_USER_EMAIL,
  DEMO_USER_EXTERNAL_ID,
  DEMO_USER_ID,
  DEMO_USER_LOGIN,
  DEMO_USER_NAME,
  DEMO_USERS,
} from "./profile";

/** The `state_setting` key that marks a completed seed. */
export const DEMO_SEED_MARKER = "demo.seeded";

const DAY = 86_400_000;

/** The `{ session, user }` shape hooks apply as the demo request session. */
export interface DemoAuth {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
  };
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: number;
  };
}

/** `owner/name` split for a demo repo. */
function repoParts(slug: string): { org: string; name: string } {
  const [org, name] = slug.split("/");
  return { org, name };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The Monday (UTC) of the week containing `ms`, as `YYYY-MM-DD`. */
function mondayOf(ms: number): string {
  const weekday = new Date(ms).getUTCDay();
  const offset = (weekday + 6) % 7;
  return isoDate(ms - offset * DAY);
}

const DEMO_GITHUB = { forge: DEMO_FORGE, instance: DEMO_INSTANCE } as const;

/** The mirrored person for a login (or `demo` by default). */
function person(login: string): UserRecord {
  const user = DEMO_USERS.find((entry) => entry.login === login);
  if (!user) throw new Error(`unknown demo user ${login}`);
  return {
    id: 0,
    externalId: user.externalId,
    ...DEMO_GITHUB,
    login: user.login,
    avatarUrl: `https://avatars.githubusercontent.com/u/${user.externalId}?v=4`,
    url: `https://github.com/${user.login}`,
  };
}

const demo = person(DEMO_USER_LOGIN);
const mira = person("mira");
const jonas = person("jonas");
const priya = person("priya");
const theo = person("theo");

/** One seeded issue before the mirror row is assembled. */
interface DemoIssue {
  repo: "funnel" | "platform";
  number: number;
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  author: string;
  milestone: number | null;
  state?: "open" | "closed";
  closedDaysAgo?: number;
  createdDaysAgo: number;
  updatedHoursAgo: number;
  comments?: Array<{ author: string; body: string; hoursAgo: number }>;
  blocked?: Omit<BlockWriteInfo, "recheck"> & { recheckOffsetDays: number };
  epicChildren?: string[];
}

const ISSUES: DemoIssue[] = [
  {
    repo: "funnel",
    number: 1,
    title: "Board cards flicker when the SSE refresh lands mid-drag",
    body: [
      "## Problem",
      "",
      "Dragging a card while the mirror revision event arrives re-renders the column underneath the pointer.",
      "",
      "### Steps to reproduce",
      "",
      "1. Open the board on a busy repository.",
      "2. Start dragging a card to **In Progress**.",
      "3. Wait for the next refresh tick (~30s).",
      "",
      "The card snaps back until the drag ends. Repro rate is roughly 1 in 4 on a fast connection.",
      "",
      "```ts",
      "onMount(() => subscribe(() => invalidateAll()));",
      "```",
    ].join("\n"),
    labels: ["backlog", "frontend", "sev", "high"],
    assignees: ["demo"],
    author: "mira",
    milestone: 1,
    createdDaysAgo: 9,
    updatedHoursAgo: 3,
    comments: [
      {
        author: "mira",
        body: "I can reproduce this reliably when the drag takes longer than two seconds.",
        hoursAgo: 30,
      },
      {
        author: "jonas",
        body: "The refresh should be deferred while a drag is active — it is purely a rendering concern.",
        hoursAgo: 20,
      },
      {
        author: "priya",
        body: "Patching the board store locally keeps the card stable; I will open a draft.",
        hoursAgo: 4,
      },
    ],
  },
  {
    repo: "funnel",
    number: 2,
    title: "Intake form drops the reporter's email when JavaScript is disabled",
    body: [
      "The no-JS fallback posts to `/api/intake`, but the optional `email` field is not forwarded.",
      "",
      "- Server wants `email` as a top-level field.",
      "- The form action only serialises `title` and `body`.",
      "",
      "Worth confirming whether we still want the field at all.",
    ].join("\n"),
    labels: ["frontend"],
    assignees: [],
    author: "theo",
    milestone: null,
    createdDaysAgo: 2,
    updatedHoursAgo: 2,
  },
  {
    repo: "funnel",
    number: 3,
    title: "Add a keyboard shortcut for triaging the next inbox item",
    body: [
      "Triaging twenty submissions currently means twenty mouse trips.",
      "",
      "Proposal: `j`/`k` to move and `e` to accept. The hotkey registry already has the scaffolding.",
    ].join("\n"),
    labels: ["todo", "backend", "mod", "mid"],
    assignees: ["jonas"],
    author: "demo",
    milestone: 1,
    createdDaysAgo: 12,
    updatedHoursAgo: 26,
  },
  {
    repo: "funnel",
    number: 4,
    title: "Cockpit time panel double-counts review time in the actual total",
    body: [
      "## Summary",
      "",
      "Review time is counted twice when an issue moves from in-progress to in-review and back.",
      "",
      "Expected: one merged interval per active period. Actual: the total keeps two.",
      "",
      "### Acceptance criteria",
      "",
      "- [ ] Overlapping active intervals merge before totalling.",
      "- [ ] Time totals reconcile with the capacity panel.",
    ].join("\n"),
    labels: ["in-progress", "frontend", "sev", "high"],
    assignees: ["demo", "mira"],
    author: "mira",
    milestone: 1,
    createdDaysAgo: 15,
    updatedHoursAgo: 5,
  },
  {
    repo: "funnel",
    number: 5,
    title: "Document the demo workflow for contributors",
    body: [
      "Contributors keep asking how to get a populated board without a GitHub App.",
      "",
      "Add a how-to covering the demo entrypoint, what it seeds, and how to reset it.",
    ].join("\n"),
    labels: ["in-review", "docs", "min", "low"],
    assignees: ["priya"],
    author: "priya",
    milestone: 2,
    createdDaysAgo: 6,
    updatedHoursAgo: 9,
  },
  {
    repo: "funnel",
    number: 6,
    title: "Upgrade Drizzle after the SQLite driver change",
    body: [
      "The driver bundle changed shape in the last release; our migration runner needs a matching bump.",
      "",
      "Blocked until the upstream typing regression is fixed.",
    ].join("\n"),
    labels: ["in-progress", "blocked", "backend", "sev", "high"],
    assignees: ["jonas"],
    author: "jonas",
    milestone: 1,
    createdDaysAgo: 18,
    updatedHoursAgo: 14,
    blocked: {
      blocker: "Upstream typings break on `drizzle-kit`",
      needs: "Release 1.0.0-rc.5 with the reverted generic",
      trying: "Pin rc.4 and keep the migration patch local",
      reason: "dependency",
      recheckOffsetDays: -2,
    },
  },
  {
    repo: "funnel",
    number: 7,
    title: "Triage the notification digest copy",
    body: [
      "The digest still says “new on your watchlist” for mentions. Reword once product signs off.",
    ].join("\n"),
    labels: ["todo", "blocked", "docs", "mod", "mid"],
    assignees: ["priya"],
    author: "demo",
    milestone: 2,
    createdDaysAgo: 4,
    updatedHoursAgo: 11,
    blocked: {
      blocker: "Waiting on the product review of the digest email",
      needs: "Sign-off from product on the final wording",
      trying: "Drafting two variants for the review",
      reason: "review",
      recheckOffsetDays: 0,
    },
  },
  {
    repo: "funnel",
    number: 8,
    title: "Split the settings page into per-section loaders",
    body: [
      "The settings route now loads every section on every visit. That is ~120ms of work for a page most people open for one field.",
      "",
      "Plan: one loader per section, hydrated independently.",
    ].join("\n"),
    labels: ["backlog", "blocked", "backend", "min", "mid"],
    assignees: ["demo"],
    author: "theo",
    milestone: null,
    createdDaysAgo: 21,
    updatedHoursAgo: 50,
    blocked: {
      blocker: "Blocked on the routing refactor",
      needs: "Land the route-group split first",
      trying: "Prototyping the loader shape behind a flag",
      reason: "capacity",
      recheckOffsetDays: 5,
    },
  },
  {
    repo: "funnel",
    number: 9,
    title: "Prune retired priority labels on sync",
    body: [
      "Retired `p1`/`p2`/`p3` labels survive every sync. We flag the conflict, but never clean them up.",
      "",
      "Done in #13 by extending the reconciliation pass.",
    ].join("\n"),
    labels: ["docs"],
    assignees: ["jonas"],
    author: "jonas",
    milestone: 1,
    state: "closed",
    closedDaysAgo: 3,
    createdDaysAgo: 25,
    updatedHoursAgo: 72,
  },
  {
    repo: "funnel",
    number: 10,
    title: "Epic: make the cockpit fast on a cold cache",
    body: [
      "## Goal",
      "",
      "First paint under 300ms with an empty cache, and under 150ms warm.",
      "",
      "Tracked children are listed in the metadata block at the bottom of this issue.",
    ].join("\n"),
    labels: ["backlog", "epic", "frontend"],
    assignees: ["demo"],
    author: "demo",
    milestone: 2,
    createdDaysAgo: 30,
    updatedHoursAgo: 30,
    epicChildren: ["demo/funnel#4", "demo/funnel#5"],
  },
  {
    repo: "funnel",
    number: 11,
    title: "SSE reconnect storms after a laptop sleeps",
    body: [
      "Every tab reconnects at once and the server logs a burst of 502s.",
      "",
      "Add jitter and a capped exponential backoff in the client.",
    ].join("\n"),
    labels: ["in-progress", "infra", "mod", "high"],
    assignees: ["mira"],
    author: "mira",
    milestone: 2,
    createdDaysAgo: 8,
    updatedHoursAgo: 6,
  },
  {
    repo: "funnel",
    number: 12,
    title: "Expose blocked duration on the issue list",
    body: [
      "The Inspector shows delay intervals; the list shows nothing.",
      "",
      "Add a compact badge sourced from `state_issue_delay`.",
    ].join("\n"),
    labels: ["in-review", "frontend", "min", "mid"],
    assignees: ["theo"],
    author: "theo",
    milestone: 2,
    createdDaysAgo: 7,
    updatedHoursAgo: 18,
  },
  {
    repo: "funnel",
    number: 13,
    title: "Return a stable 404 shape from issue writes",
    body: [
      "Write endpoints currently return raw provider errors. Wrap them in the shared `Outcome` shape.",
    ].join("\n"),
    labels: ["backend"],
    assignees: ["demo"],
    author: "jonas",
    milestone: 1,
    state: "closed",
    closedDaysAgo: 8,
    createdDaysAgo: 28,
    updatedHoursAgo: 160,
  },
  {
    repo: "funnel",
    number: 14,
    title: "Audit log for admin role changes",
    body: [
      "Role promotions are invisible after the fact.",
      "",
      "Capture actor, target and previous role in an append-only table.",
    ].join("\n"),
    labels: ["todo", "infra"],
    assignees: [],
    author: "priya",
    milestone: null,
    createdDaysAgo: 5,
    updatedHoursAgo: 40,
  },
  {
    repo: "platform",
    number: 1,
    title: "Migrate the build cache to the shared runner pool",
    body: [
      "The self-hosted runner cache is rebuilt from scratch on every deploy.",
      "",
      "Moving it to the shared pool cuts cold builds by about four minutes.",
    ].join("\n"),
    labels: ["backlog", "infra", "mod", "mid"],
    assignees: ["jonas"],
    author: "jonas",
    milestone: 1,
    createdDaysAgo: 11,
    updatedHoursAgo: 22,
  },
  {
    repo: "platform",
    number: 2,
    title: "Typed client for the deployment API",
    body: [
      "Deploy scripts re-implement the auth dance in bash.",
      "",
      "Generate a typed client from the OpenAPI document and delete the scripts.",
    ].join("\n"),
    labels: ["in-progress", "backend", "sev", "high"],
    assignees: ["demo"],
    author: "demo",
    milestone: 1,
    createdDaysAgo: 14,
    updatedHoursAgo: 1,
  },
  {
    repo: "platform",
    number: 3,
    title: "Document the incident rotation",
    body: [
      "The on-call docs are three quarters stale and link to a retired dashboard.",
    ].join("\n"),
    labels: ["in-review", "docs", "min", "low"],
    assignees: ["priya"],
    author: "priya",
    milestone: 2,
    createdDaysAgo: 3,
    updatedHoursAgo: 12,
  },
  {
    repo: "platform",
    number: 4,
    title: "Retire the legacy metrics shim",
    body: ["Every service ships two metric paths. The shim can go."].join("\n"),
    labels: ["infra"],
    assignees: ["theo"],
    author: "theo",
    milestone: 2,
    state: "closed",
    closedDaysAgo: 12,
    createdDaysAgo: 40,
    updatedHoursAgo: 200,
  },
  {
    repo: "platform",
    number: 5,
    title: "Postgres connection pool is exhausted under load test",
    body: [
      "At 400 rps the pool saturates and requests queue for 30s.",
      "",
      "Possible causes: leaked clients in the report job, or a pool size tuned for a single replica.",
    ].join("\n"),
    labels: ["backend"],
    assignees: [],
    author: "mira",
    milestone: null,
    createdDaysAgo: 1,
    updatedHoursAgo: 1,
  },
  {
    repo: "platform",
    number: 6,
    title: "Add a smoke test for the release image",
    body: [
      "The release pipeline builds an image nobody executes until deploy.",
      "",
      "Run `--version` and the health endpoint in CI.",
    ].join("\n"),
    labels: ["todo", "infra", "mod", "mid"],
    assignees: ["mira"],
    author: "mira",
    milestone: 1,
    createdDaysAgo: 9,
    updatedHoursAgo: 44,
  },
  {
    repo: "platform",
    number: 7,
    title: "Rotate the deploy signing key",
    body: [
      "The signing key predates the current secret store and has no rotation record.",
    ].join("\n"),
    labels: ["in-progress", "infra", "sev", "high"],
    assignees: ["demo", "jonas"],
    author: "jonas",
    milestone: 2,
    createdDaysAgo: 6,
    updatedHoursAgo: 8,
  },
  {
    repo: "platform",
    number: 8,
    title: "Make the status page build reproducible",
    body: [
      "Two builds of the same commit produce different HTML because the generator embeds the wall clock.",
    ].join("\n"),
    labels: ["in-review", "frontend", "min", "low"],
    assignees: ["priya"],
    author: "priya",
    milestone: 2,
    createdDaysAgo: 4,
    updatedHoursAgo: 16,
  },
];

function toStoredMetadata(labels: readonly string[]): StoredMetadata {
  const metadata = deriveMetadata(labels);
  return {
    status: metadata.status,
    impact: metadata.impact,
    urgency: metadata.urgency,
    priority: metadata.priority,
    size: metadata.size,
    blocked: metadata.blocked,
    isEpic: metadata.isEpic,
    labelConflict: metadata.conflicts.length > 0,
  };
}

function repoIdFor(
  repos: Readonly<Record<"funnel" | "platform", number>>,
  key: DemoIssue["repo"],
): number {
  return repos[key];
}

/** Create a fake GitHub App only when the instance has none. */
function ensureDemoApp(): void {
  if (getGithubCredentials()) return;
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  saveManifestCredentials({
    appId: 900_001,
    slug: "funnel-demo",
    name: "funnel-demo",
    ownerLogin: "demo",
    ownerType: "Organization",
    htmlUrl: "https://github.com/apps/funnel-demo",
    baseUrl: FUNNEL_URL ?? "http://localhost:5173",
    clientId: "Iv1.demo0000000000000",
    clientSecret: "demo-client-secret-0000000000000000000000",
    privateKey,
  });
  setInstallationId(1);
}

function writeSettingsSeed(): void {
  const maintainers: MaintainerInput[] = ["demo", "mira", "jonas", "priya"].map(
    (login) => {
      const user = person(login);
      return {
        forge: DEMO_FORGE,
        instance: DEMO_INSTANCE,
        external_id: user.externalId,
        login: user.login,
        weekly_minutes: 2400,
        active: true,
      };
    },
  );

  writeSettings({
    repos: [
      { repo: DEMO_REPO_SLUGS[0], shortcode: "FUN" },
      { repo: DEMO_REPO_SLUGS[1], shortcode: "PLT" },
    ],
    projects: ["frontend", "backend", "docs", "infra"],
    labels: { prefix: "" },
    intake: { default_repo: DEMO_REPO_SLUGS[0] },
    sync: {
      history_days: 90,
      poll_interval_active_seconds: 30,
      poll_interval_idle_seconds: 300,
      pr_in_review: false,
      pr_done: false,
    },
    board: { done_days: 14, wip_limits: {} },
    session: { idle_days: 30 },
    notifications: { enabled: true, native: true, new_intake: true },
    planning: {
      size_minutes: { ...DEFAULT_SIZE_MINUTES },
      allocation_percent: DEFAULT_ALLOCATION_PERCENT,
      cycle_weeks: DEFAULT_CYCLE_WEEKS,
      cycle_anchor: DEFAULT_CYCLE_ANCHOR,
      maintainers,
    },
  });
}

function writeAuthSeed(now: number): void {
  db.insert(authUser)
    .values({
      id: DEMO_USER_ID,
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      emailVerified: true,
      image: null,
      role: "admin",
      banned: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: authUser.id,
      set: {
        name: DEMO_USER_NAME,
        email: DEMO_USER_EMAIL,
        role: "admin",
        updatedAt: new Date(now),
      },
    })
    .run();

  db.insert(authAccount)
    .values({
      id: "demo-github-account",
      accountId: DEMO_USER_EXTERNAL_ID,
      providerId: DEMO_FORGE,
      userId: DEMO_USER_ID,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing()
    .run();

  db.insert(authSession)
    .values({
      id: "demo-session",
      expiresAt: new Date(now + 30 * DAY),
      token: "demo-session-token",
      userId: DEMO_USER_ID,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: authSession.id,
      set: {
        expiresAt: new Date(now + 30 * DAY),
        updatedAt: new Date(now),
      },
    })
    .run();
}

function writeMirrorSeed(now: number): void {
  const repoLabels: RepoLabelRecord[] = [
    ...CANONICAL_LABELS.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description,
    })),
    ...DEMO_EXTRA_LABELS.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description,
    })),
  ];

  const repos = {
    funnel: upsertRepo({
      externalId: "demo-funnel",
      ...DEMO_GITHUB,
      ...repoParts(DEMO_REPO_SLUGS[0]),
      url: `https://github.com/${DEMO_REPO_SLUGS[0]}`,
      archived: false,
    }).id,
    platform: upsertRepo({
      externalId: "demo-platform",
      ...DEMO_GITHUB,
      ...repoParts(DEMO_REPO_SLUGS[1]),
      url: `https://github.com/${DEMO_REPO_SLUGS[1]}`,
      archived: false,
    }).id,
  };

  for (const repoId of Object.values(repos)) {
    replaceRepoLabels(repoId, repoLabels);
    replaceRepoAssignees(repoId, [demo, mira, jonas, priya, theo]);
  }

  const milestones: Array<{ repo: DemoIssue["repo"]; records: MilestoneRecord[] }> = [
    {
      repo: "funnel",
      records: [
        {
          number: 1,
          externalId: "demo-milestone-funnel-1",
          title: "v2.0 — cockpit",
          description: "The demo release: board, planning and actuals.",
          state: "open",
          dueOn: now + 21 * DAY,
          openIssues: 8,
          closedIssues: 2,
          creator: demo,
          createdAt: now - 30 * DAY,
          updatedAt: now - 2 * DAY,
          closedAt: null,
          url: `https://github.com/${DEMO_REPO_SLUGS[0]}/milestone/1`,
        },
        {
          number: 2,
          externalId: "demo-milestone-funnel-2",
          title: "Docs refresh",
          description: "How-tos that match the current UI.",
          state: "open",
          dueOn: now + 45 * DAY,
          openIssues: 5,
          closedIssues: 1,
          creator: priya,
          createdAt: now - 20 * DAY,
          updatedAt: now - DAY,
          closedAt: null,
          url: `https://github.com/${DEMO_REPO_SLUGS[0]}/milestone/2`,
        },
      ],
    },
    {
      repo: "platform",
      records: [
        {
          number: 1,
          externalId: "demo-milestone-platform-1",
          title: "Reliability sprint",
          description: "Pooling, rotation and reproducible builds.",
          state: "open",
          dueOn: now + 30 * DAY,
          openIssues: 4,
          closedIssues: 1,
          creator: jonas,
          createdAt: now - 25 * DAY,
          updatedAt: now - 3 * DAY,
          closedAt: null,
          url: `https://github.com/${DEMO_REPO_SLUGS[1]}/milestone/1`,
        },
      ],
    },
  ];
  for (const group of milestones) {
    replaceRepoMilestones(repos[group.repo], group.records);
  }

  const records: IssueRecord[] = ISSUES.map((issue) => {
    let body = issue.body;
    if (issue.blocked) {
      body = writeBlocked(body, {
        ...issue.blocked,
        recheck: isoDate(now + issue.blocked.recheckOffsetDays * DAY),
      });
    }
    if (issue.epicChildren) body = writeEpicChildren(body, issue.epicChildren);
    const created = now - issue.createdDaysAgo * DAY;
    const updated = now - issue.updatedHoursAgo * 60 * 60 * 1000;
    return {
      externalId: `demo-${issue.repo}-${issue.number}`,
      repoId: repoIdFor(repos, issue.repo),
      number: issue.number,
      kind: "issue",
      title: issue.title,
      body,
      state: issue.state ?? "open",
      stateReason: issue.state === "closed" ? "completed" : null,
      author: person(issue.author),
      milestoneNumber: issue.milestone,
      url: `https://github.com/${DEMO_REPO_SLUGS[issue.repo === "funnel" ? 0 : 1]}/issues/${issue.number}`,
      createdAt: created,
      updatedAt: updated,
      closedAt:
        issue.closedDaysAgo === undefined
          ? null
          : now - issue.closedDaysAgo * DAY,
      labels: issue.labels,
      assignees: issue.assignees.map((login) => person(login)),
      comments: (issue.comments ?? []).map((comment, index) => ({
        externalId: `demo-${issue.repo}-${issue.number}-c${index + 1}`,
        author: person(comment.author),
        body: comment.body,
        createdAt: now - comment.hoursAgo * 60 * 60 * 1000,
        updatedAt: now - comment.hoursAgo * 60 * 60 * 1000,
      })),
    };
  });

  upsertIssues(records, (issue) => toStoredMetadata(issue.labels));
}

function writeDurableStateSeed(now: number): void {
  db.insert(stateIntakeSubmission)
    .values([
      {
        id: "demo-intake-1",
        title: "Export the board to CSV",
        body: "Our retro would be easier with a CSV dump of the current board.",
        source: "web",
        createdAt: now - 3 * DAY,
      },
      {
        id: "demo-intake-2",
        title: "Slack notifications for priority P1",
        body: "We only look at the app when something is on fire.",
        source: "web",
        createdAt: now - 2 * DAY,
      },
      {
        id: "demo-intake-3",
        title: "Dark mode for the activity feed",
        body: "The activity list is the one view that ignores the theme switch.",
        source: "email",
        createdAt: now - 20 * 60 * 60 * 1000,
      },
      {
        id: "demo-intake-4",
        title: "Link intake submissions to existing issues",
        body: "Sometimes a submission is a duplicate but not an exact one.",
        source: null,
        createdAt: now - 4 * 60 * 60 * 1000,
      },
    ])
    .onConflictDoNothing()
    .run();

  db.insert(stateNotification)
    .values([
      {
        id: "demo-notification-1",
        userId: DEMO_USER_ID,
        kind: "assigned",
        dedupeKey: "demo:assigned:funnel#4:demo",
        title: "You were assigned demo/funnel#4",
        body: "Cockpit time panel double-counts review time in the actual total",
        url: "/issues/demo/funnel/4",
        actorLogin: "mira",
        actorAvatarUrl: mira.avatarUrl,
        createdAt: now - 5 * 60 * 60 * 1000,
        readAt: null,
      },
      {
        id: "demo-notification-2",
        userId: DEMO_USER_ID,
        kind: "comment",
        dedupeKey: "demo:comment:funnel#1:c3",
        title: "Priya commented on demo/funnel#1",
        body: "Patching the board store locally keeps the card stable; I will open a draft.",
        url: "/issues/demo/funnel/1",
        actorLogin: "priya",
        actorAvatarUrl: priya.avatarUrl,
        createdAt: now - 4 * 60 * 60 * 1000,
        readAt: null,
      },
      {
        id: "demo-notification-3",
        userId: DEMO_USER_ID,
        kind: "new_intake",
        dedupeKey: "demo:new_intake:demo-intake-1",
        title: "New intake: Export the board to CSV",
        url: "/inbox/submission/demo-intake-1",
        actorLogin: null,
        actorAvatarUrl: null,
        createdAt: now - 3 * DAY,
        readAt: null,
      },
      {
        id: "demo-notification-4",
        userId: DEMO_USER_ID,
        kind: "priority",
        dedupeKey: "demo:priority:funnel#4:P1",
        title: "demo/funnel#4 is now P1",
        url: "/issues/demo/funnel/4",
        actorLogin: "jonas",
        actorAvatarUrl: jonas.avatarUrl,
        createdAt: now - 26 * 60 * 60 * 1000,
        readAt: null,
      },
    ])
    .onConflictDoNothing()
    .run();

  db.insert(stateWorkNote)
    .values([
      {
        id: "demo-work-note-1",
        org: "demo",
        name: "funnel",
        issueNumber: 4,
        authorExternalId: demo.externalId,
        authorForge: DEMO_FORGE,
        authorInstance: DEMO_INSTANCE,
        authorLogin: demo.login,
        authorAvatarUrl: demo.avatarUrl,
        body: "Pairing with Mira tomorrow to walk through the buffer maths.",
        createdAt: now - 2 * DAY,
        updatedAt: now - 2 * DAY,
      },
      {
        id: "demo-work-note-2",
        org: "demo",
        name: "funnel",
        issueNumber: 6,
        authorExternalId: demo.externalId,
        authorForge: DEMO_FORGE,
        authorInstance: DEMO_INSTANCE,
        authorLogin: demo.login,
        authorAvatarUrl: demo.avatarUrl,
        body: "Recheck the upstream release before Friday; otherwise pin rc.4 again.",
        createdAt: now - DAY,
        updatedAt: now - 12 * 60 * 60 * 1000,
      },
    ])
    .onConflictDoNothing()
    .run();

  const thisMonday = mondayOf(now);
  const nextMonday = isoDate(Date.parse(`${thisMonday}T00:00:00Z`) + 7 * DAY);
  setPlanItem({
    org: "demo",
    name: "funnel",
    issueNumber: 4,
    weekStart: thisMonday,
  });
  setPlanItem({
    org: "demo",
    name: "funnel",
    issueNumber: 5,
    weekStart: nextMonday,
  });
  setPlanItem({
    org: "demo",
    name: "platform",
    issueNumber: 7,
    weekStart: thisMonday,
  });

  db.insert(stateIssueEvent)
    .values([
      {
        id: "demo-event-1",
        org: "demo",
        name: "funnel",
        issueNumber: 4,
        kind: "status",
        fromValue: null,
        toValue: "in-progress",
        at: now - 6 * DAY,
        source: "migration",
      },
      {
        id: "demo-event-2",
        org: "demo",
        name: "funnel",
        issueNumber: 4,
        kind: "state",
        fromValue: null,
        toValue: "open",
        at: now - 6 * DAY,
        source: "migration",
      },
    ])
    .onConflictDoNothing()
    .run();

  db.insert(stateIssueDelay)
    .values([
      {
        id: "demo-delay-1",
        org: "demo",
        name: "funnel",
        issueNumber: 6,
        reason: "dependency",
        startedAt: now - 4 * DAY,
        endedAt: null,
        note: "Waiting on the upstream typings release.",
        source: "blocked",
      },
      {
        id: "demo-delay-2",
        org: "demo",
        name: "funnel",
        issueNumber: 7,
        reason: "review",
        startedAt: now - DAY,
        endedAt: null,
        note: "Copy review with product.",
        source: "blocked",
      },
      {
        id: "demo-delay-3",
        org: "demo",
        name: "funnel",
        issueNumber: 8,
        reason: "capacity",
        startedAt: now - 2 * DAY,
        endedAt: null,
        note: "Blocked on the routing refactor.",
        source: "blocked",
      },
    ])
    .onConflictDoNothing()
    .run();
}

/**
 * Seed the demo database once. Returns `{ seeded: true }` when this call wrote
 * the data and `{ seeded: false }` when the marker was already present.
 * `options.now` is the seed clock (unix ms); it defaults to `Date.now()`.
 */
export function seedDemoDatabase(options?: { now?: number }): {
  seeded: boolean;
} {
  const marker = db
    .select({ key: stateSetting.key })
    .from(stateSetting)
    .where(eq(stateSetting.key, DEMO_SEED_MARKER))
    .get();
  if (marker) return { seeded: false };

  const now = options?.now ?? Date.now();

  ensureDemoApp();
  writeSettingsSeed();
  writeAuthSeed(now);
  writeMirrorSeed(now);
  writeDurableStateSeed(now);

  db.insert(stateSetting)
    .values({
      key: DEMO_SEED_MARKER,
      value: JSON.stringify({ at: now }),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: stateSetting.key,
      set: { value: JSON.stringify({ at: now }), updatedAt: now },
    })
    .run();

  return { seeded: true };
}

/** The seeded admin's session, or `null` while the demo user is absent. */
export function getDemoAuth(): DemoAuth | null {
  const user = db
    .select()
    .from(authUser)
    .where(eq(authUser.id, DEMO_USER_ID))
    .get();
  if (!user) return null;
  const session = db
    .select()
    .from(authSession)
    .where(eq(authSession.userId, DEMO_USER_ID))
    .get();
  if (!session) return null;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      role: user.role ?? "read",
    },
    session: {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: session.expiresAt.getTime(),
    },
  };
}
