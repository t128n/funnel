/**
 * Seed a throwaway Funnel database for the design captures.
 *
 * The scripts in this folder run outside Vite (`bun scripts/screenshots/...`),
 * so they cannot import `$app/*` or `#lib/*`. Everything here is plain
 * `bun:sqlite` plus the committed migration files, mirroring what
 * `src/lib/server/db` would build at runtime.
 *
 * Usage:
 *   bun scripts/screenshots/seed.ts --out /tmp/funnel-shots
 *
 * The DB is written to `<out>/funnel.db` (or `--db <path>`); stdout carries
 * only the signed session cookie, ready for `capture.ts --cookie`.
 */
import { Database, type SQLQueryBindings } from "bun:sqlite";
import {
  createCipheriv,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeSignedCookie } from "better-call";

/** Default DB filename inside `--out`. */
export const DEFAULT_DB_NAME = "funnel.db";

/** Secret used when the CLI is invoked without `--secret` or FUNNEL_SECRET. */
export const DEFAULT_SECRET = "funnel-screenshots-secret-0123456789abcdef";

/** The demo repository every seeded row belongs to. */
const REPO = { org: "acme", name: "widgets" } as const;

/** Known session token; the signed cookie wraps this value. */
const SESSION_TOKEN = "screenshots-session-token";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for `offsetDays` from today, in UTC (the demo's timezone). */
function isoDateOffset(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * DAY_MS);
  return date.toISOString().slice(0, 10);
}

/** The Monday of the current ISO week as `YYYY-MM-DD`. */
function currentWeekStart(): string {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // `getUTCDay()` is 0 for Sunday, which belongs to the week that started six
  // days earlier.
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return date.toISOString().slice(0, 10);
}

/**
 * The blocked envelope `funnel-metadata.ts` reads: a YAML mapping inside the
 * trailing `<!-- funnel_metadata -->` comment. Written here rather than
 * imported because this script sits outside the Vite alias graph.
 */
function blockedEnvelope(info: {
  blocker: string;
  needs: string;
  trying: string;
  recheck: string;
  reason: string;
}): string {
  return [
    "<!-- funnel_metadata",
    "blocked:",
    "  is_blocked: true",
    `  blocker: ${JSON.stringify(info.blocker)}`,
    `  needs: ${JSON.stringify(info.needs)}`,
    `  trying: ${JSON.stringify(info.trying)}`,
    `  recheck: ${JSON.stringify(info.recheck)}`,
    `  reason: ${JSON.stringify(info.reason)}`,
    "-->",
  ].join("\n");
}


export interface SeedOptions {
  dbPath: string;
  secret: string;
}

export interface SeedResult {
  /** `better-auth.session_token=<signed>` — the `Cookie` header value. */
  cookie: string;
  /** The unsigned session token stored in `auth_session`. */
  token: string;
}

/**
 * Apply the committed Drizzle migrations in sorted directory order.
 *
 * The project has no `meta/_journal.json`, so `drizzle-orm`'s migrator is not
 * usable here; the SQL files themselves are the source of truth.
 */
function migrate(sqlite: Database): void {
  const migrations = fileURLToPath(new URL("../../drizzle", import.meta.url));
  const directories = readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directory of directories) {
    const file = join(migrations, directory, "migration.sql");
    if (!existsSync(file)) continue;
    sqlite.exec(readFileSync(file, "utf8"));
  }
}

/** AES-256-GCM envelope: `iv:tag:ciphertext`, all base64. */
function encryptSecret(plaintext: string, secret: string): string {
  const key = scryptSync(secret, "funnel/github-app/secret", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** The reserved label vocabulary, hardcoded because `#lib/*` is unavailable. */
const LABELS = [
  { name: "backlog", color: "6f737a", description: "Status: Backlog" },
  { name: "todo", color: "56a8f5", description: "Status: Todo" },
  { name: "in-progress", color: "3574f0", description: "Status: In Progress" },
  { name: "in-review", color: "b389f5", description: "Status: In Review" },
  { name: "blocked", color: "fa6675", description: "Flag: Blocked" },
  { name: "sev", color: "fa6675", description: "Impact: Severe" },
  { name: "mod", color: "cf8e6d", description: "Impact: Moderate" },
  { name: "min", color: "6aab73", description: "Impact: Minor" },
  { name: "high", color: "f87171", description: "Urgency: High" },
  { name: "mid", color: "facc15", description: "Urgency: Mid" },
  { name: "low", color: "94a3b8", description: "Urgency: Low" },
  { name: "sm", color: "6aab73", description: "Size: Small" },
  { name: "md", color: "2aacb8", description: "Size: Medium" },
  { name: "lg", color: "e28d78", description: "Size: Large" },
  { name: "epic", color: "b389f5", description: "Type: Epic" },
  { name: "accessibility", color: "0d6efd", description: "Accessibility" },
  { name: "bug", color: "d73a4a", description: "Something is not working" },
  { name: "enhancement", color: "a2eeef", description: "New feature or request" },
  { name: "regression", color: "e99695", description: "Regression" },
] as const;

/** One demo issue. */
interface DemoIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  stateReason: string | null;
  status: string | null;
  impact: 1 | 2 | 3 | null;
  urgency: 1 | 2 | 3 | null;
  priority: "P1" | "P2" | "P3" | null;
  priorityRank: 0 | 1 | 2 | 3;
  size: "sm" | "md" | "lg";
  blocked?: boolean;
  epic?: boolean;
  author: number;
  assignee: number;
  milestone: number | null;
  labels: string[];
  updatedOffsetMinutes: number;
  closedOffsetDays?: number;
}

/**
 * The demo set: one repo, six issues (one closed, one blocked, one epic, one
 * untriaged for the Inbox) and two markdown comments each.
 */
const ISSUES: DemoIssue[] = [
  {
    number: 1,
    title: "Widget grid collapses below 480px",
    body: [
      "The three-column widget grid drops to one column as soon as the",
      "viewport is narrower than 480px, which also squashes the sparklines.",
      "",
      "### Steps",
      "",
      "1. Open a dashboard at 1440px.",
      "2. Resize the window below 480px.",
      "3. Watch the middle column jump under the first one.",
      "",
      "The breakpoint should be 640px (`sm`), not 480px.",
      "",
      "```css",
      ".widget-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }",
      "```",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "in-progress",
    impact: 2,
    urgency: 1,
    priority: "P1",
    priorityRank: 0,
    size: "md",
    author: 1,
    assignee: 2,
    milestone: 1,
    labels: ["in-progress", "mod", "high", "md", "accessibility"],
    updatedOffsetMinutes: 15,
  },
  {
    number: 2,
    title: "Comment composer swallows Cmd+Enter in Safari",
    body: [
      "Pressing `Cmd+Enter` in the comment composer closes the dialog but",
      "never saves the draft. Chrome and Firefox save as expected.",
      "",
      "Reproduced on Safari 18.2, macOS 15.2.",
      "",
      blockedEnvelope({
        blocker: "Safari key handling differs from the other engines",
        needs: "A decision on using the keydown capture phase",
        trying: "Logging the event order in a local build",
        recheck: isoDateOffset(2),
        reason: "dependency",
      }),
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "todo",
    impact: 1,
    urgency: 1,
    priority: "P1",
    priorityRank: 0,
    size: "sm",
    blocked: true,
    author: 3,
    assignee: 1,
    milestone: null,
    labels: ["todo", "blocked", "sev", "high", "sm", "bug"],
    updatedOffsetMinutes: 90,
  },
  {
    number: 3,
    title: "Board lane headers drift on horizontal scroll",
    body: [
      "The lane header cell scrolls with the cards, so the column name is",
      "gone exactly when a long backlog needs it. It should stick to the top",
      "of the lane while the lane itself scrolls.",
      "",
      "No data change: the header just needs `position: sticky`.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "in-review",
    impact: 2,
    urgency: 2,
    priority: "P2",
    priorityRank: 1,
    size: "md",
    author: 2,
    assignee: 3,
    milestone: 1,
    labels: ["in-review", "mod", "mid", "md", "regression"],
    updatedOffsetMinutes: 240,
  },
  {
    number: 4,
    title: "Epic: Bugzilla table and numbered comments",
    body: [
      "Umbrella for the table-first redesign: 1px rules, numbered `#cN`",
      "comment anchors and plain-text metadata instead of pills.",
      "",
      "<!-- funnel_metadata",
      "epic:",
      '  children: "acme/widgets#1,acme/widgets#2"',
      "-->",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "backlog",
    impact: 3,
    urgency: 3,
    priority: "P3",
    priorityRank: 2,
    size: "lg",
    epic: true,
    author: 1,
    assignee: 1,
    milestone: 1,
    labels: ["backlog", "epic", "min", "low", "lg"],
    updatedOffsetMinutes: 360,
  },
  {
    number: 5,
    title: "Settings: appearance radios forget the system choice",
    body: [
      "Choosing **System** in Settings → Appearance persisted `system`, but",
      "the next page load painted dark until the client hydrated.",
      "",
      "Fixed by reading the stored choice in the pre-paint script.",
    ].join("\n"),
    state: "closed",
    stateReason: "completed",
    status: "backlog",
    impact: 3,
    urgency: 3,
    priority: "P3",
    priorityRank: 2,
    size: "sm",
    author: 3,
    assignee: 3,
    milestone: 1,
    labels: ["min", "low", "sm"],
    updatedOffsetMinutes: 1440,
    closedOffsetDays: 2,
  },
  {
    number: 6,
    title: "Dates render in the server timezone",
    body: [
      "Relative timestamps on the issue page use the server's zone, not the",
      "viewer's. A comment posted at 09:00 in Berlin shows as 07:00 UTC.",
      "",
      "Needs triage: pick a status and a size.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: null,
    impact: 2,
    urgency: 3,
    priority: "P3",
    priorityRank: 2,
    size: "sm",
    author: 2,
    assignee: 2,
    milestone: null,
    labels: ["mod", "low", "sm"],
    updatedOffsetMinutes: 30,
  },
  {
    number: 7,
    title: "Order export omits widgets with no variants",
    body: [
      "Exporting an order that references a widget with an empty variant list",
      "silently drops the row, so revenue totals no longer reconcile.",
      "",
      "The impact is severe but we have not agreed how quickly it must ship.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "todo",
    impact: 1,
    urgency: null,
    priority: "P3",
    priorityRank: 2,
    size: "sm",
    author: 3,
    assignee: 1,
    milestone: null,
    labels: ["todo", "sev", "sm"],
    updatedOffsetMinutes: 45,
  },
  {
    number: 8,
    title: "Dashboard tiles load one at a time on cold start",
    body: [
      "Each tile waits for the previous one to finish before it paints, so a",
      "cold dashboard takes several seconds even on a fast connection.",
      "",
      "Flagged urgent by support; we still need to score the blast radius.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "todo",
    impact: null,
    urgency: 1,
    priority: "P3",
    priorityRank: 2,
    size: "lg",
    author: 2,
    assignee: 3,
    milestone: null,
    labels: ["todo", "high", "lg", "enhancement"],
    updatedOffsetMinutes: 120,
  },
  {
    number: 9,
    title: "Localize the date picker for RTL locales",
    body: [
      "The date picker still lays out left-to-right in Arabic and Hebrew, and",
      "the week starts on the wrong day.",
      "",
      "Not yet triaged: no severity or urgency has been set.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: null,
    impact: null,
    urgency: null,
    priority: null,
    priorityRank: 3,
    size: "sm",
    author: 1,
    assignee: 2,
    milestone: null,
    labels: ["sm"],
    updatedOffsetMinutes: 20,
  },
  {
    number: 10,
    title: "CSV export truncates past 1000 rows",
    body: [
      "The CSV export stops at 1000 rows without a warning, so a large",
      "reconciliation is silently incomplete.",
      "",
      "Severe data issue, but it only bites a handful of large accounts each",
      "quarter, so it can wait a little.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "in-progress",
    impact: 1,
    urgency: 3,
    priority: "P2",
    priorityRank: 1,
    size: "md",
    author: 2,
    assignee: 2,
    milestone: 1,
    labels: ["in-progress", "sev", "low", "md"],
    updatedOffsetMinutes: 210,
  },
  {
    number: 11,
    title: "Numbered comments render out of order after a merge",
    body: [
      "After merging two threads the `#cN` anchors renumber but the rendered",
      "list keeps the old order, so links jump to the wrong comment.",
      "",
      "Minor severity, but reviewers hit it every day and are blocked from",
      "quoting threads accurately.",
    ].join("\n"),
    state: "open",
    stateReason: null,
    status: "backlog",
    impact: 3,
    urgency: 1,
    priority: "P2",
    priorityRank: 1,
    size: "lg",
    author: 1,
    assignee: 3,
    milestone: 1,
    labels: ["backlog", "min", "high", "lg", "bug"],
    updatedOffsetMinutes: 480,
  },
];

/** Two markdown comments per demo issue. */
const COMMENTS: Record<number, { author: number; body: string; offsetMinutes: number }[]> = {
  1: [
    {
      author: 2,
      offsetMinutes: 600,
      body: [
        "Confirmed on a 1024px window. The media query is `max-width: 480px`,",
        "but the grid needs 3 × 220px plus gutters.",
        "",
        "I will bump the breakpoint and add a regression test for the grid class.",
      ].join("\n"),
    },
    {
      author: 1,
      offsetMinutes: 30,
      body: [
        "Thanks. Let's keep the sparkline at its current aspect ratio; only the",
        "column count should change.",
        "",
        "`grid-template-columns` is the only property I expect to move.",
      ].join("\n"),
    },
  ],
  2: [
    {
      author: 1,
      offsetMinutes: 420,
      body: [
        "Recorded the event order in Safari: `keydown` fires on the dialog",
        "before the composer sees it, so the save handler is never reached.",
      ].join("\n"),
    },
    {
      author: 3,
      offsetMinutes: 75,
      body: [
        "I can reproduce with a hardware keyboard but not with the on-screen",
        "one. Marking this blocked until we decide on the capture phase.",
      ].join("\n"),
    },
  ],
  3: [
    {
      author: 3,
      offsetMinutes: 300,
      body: [
        "The lane body already has its own scroll container; the header is a",
        "sibling, so `sticky` alone will not work.",
        "",
        "Moving the header inside the scroll container fixes it locally.",
      ].join("\n"),
    },
    {
      author: 2,
      offsetMinutes: 60,
      body: [
        "Checked a narrow window: the header stays put and the count stays",
        "readable. One 1px rule at the bottom keeps it visually separate.",
      ].join("\n"),
    },
  ],
  4: [
    {
      author: 1,
      offsetMinutes: 480,
      body: [
        "Children are #1 and #2 for now; the comment thread work will add a",
        "third once the thread is split out.",
      ].join("\n"),
    },
    {
      author: 3,
      offsetMinutes: 120,
      body: [
        "Table density: 11px uppercase headers, zebra rows, no pills.",
        "Comments: `#c1` anchor, grey header bar, mono body.",
      ].join("\n"),
    },
  ],
  5: [
    {
      author: 3,
      offsetMinutes: 2880,
      body: [
        "This was the last view that still used the client store for its",
        "initial paint. The pre-paint script now owns the first class toggle.",
      ].join("\n"),
    },
    {
      author: 1,
      offsetMinutes: 1440,
      body: [
        "Verified light, dark and system in both directions; closing as",
        "completed.",
      ].join("\n"),
    },
  ],
  6: [
    {
      author: 2,
      offsetMinutes: 180,
      body: [
        "The formatter is shared with the issue list, so the fix has to be",
        "an explicit timezone argument rather than a global.",
      ].join("\n"),
    },
    {
      author: 3,
      offsetMinutes: 25,
      body: [
        "I can take this once it is triaged. It is a small change but it",
        "touches every relative timestamp.",
      ].join("\n"),
    },
  ],
};

/** Insert all demo rows and return the signed cookie. */
async function seedRows(sqlite: Database, secret: string): Promise<SeedResult> {
  const now = Date.now();

  /** Run a statement with positional parameters. */
  const run = (sql: string, params: SQLQueryBindings[] = []) => {
    sqlite.run(sql, params);
  };

  // --- GitHub App credentials -------------------------------------------
  // Without this row the first-run gate redirects every request to
  // /onboarding. The secrets are encrypted exactly as the server expects.
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  run(
    `INSERT INTO state_github_app (
       id, app_id, slug, name, owner_login, owner_type, html_url, base_url,
       client_id, client_secret_enc, webhook_secret_enc, private_key_enc,
       installation_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "default",
      123456,
      "funnel-screenshots",
      "Funnel Screenshots",
      REPO.org,
      "Organization",
      "https://github.com/apps/funnel-screenshots",
      "http://127.0.0.1:5199",
      "Iv1.funnel-screenshots",
      encryptSecret("screenshot-client-secret", secret),
      encryptSecret("screenshot-webhook-secret", secret),
      encryptSecret(privateKey, secret),
      12345,
      now,
      now,
    ],
  );

  // --- Instance settings ------------------------------------------------
  run(
    "INSERT INTO state_setting (key, value, updated_at) VALUES (?, ?, ?)",
    ["repos", JSON.stringify([{ repo: "acme/widgets", shortcode: "WGT" }]), now],
  );
  run(
    "INSERT INTO state_setting (key, value, updated_at) VALUES (?, ?, ?)",
    ["intake.default_repo", JSON.stringify("acme/widgets"), now],
  );

  // --- Staged intake submissions ---------------------------------------
  // Two pending public submissions keep the Inbox triage table realistic:
  // Accept and Decline act on live rows, and the header's pending count is
  // sourced from the same queue the production screen renders.
  run(
    `INSERT INTO state_intake_submission (id, title, body, source, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      "screenshot-submission-widgets",
      "Widget export omits column headers",
      "When I export the widget table as CSV the first row is data instead of the column names.\n\nSteps:\n1. Open a repository.\n2. Choose Export.\n3. Inspect the first line.",
      "support@example.com",
      now - 2 * HOUR,
    ],
  );
  run(
    `INSERT INTO state_intake_submission (id, title, body, source, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      "screenshot-submission-auth",
      "Sign-in loop after switching GitHub accounts",
      "Signing out and back in with a second GitHub account returns to the login page. Clearing site data fixes it for one session.",
      "intake-form",
      now - 6 * HOUR,
    ],
  );

  // Planning defaults (the same values `src/lib/server/settings/store.ts`
  // documents). The maintainer roster is what turns the week view into lanes;
  // the rest keep capacity and the cycle horizon deterministic.
  const planningSettings: [string, unknown][] = [
    ["planning.size_minutes", { sm: 120, md: 240, lg: 480 }],
    ["planning.allocation_percent", 60],
    ["planning.cycle_weeks", 2],
    ["planning.cycle_anchor", "2024-01-01"],
    [
      "planning.maintainers",
      [
        {
          forge: "github",
          instance: "github.com",
          external_id: "9001",
          login: "dana",
          avatar_url: "",
          weekly_minutes: 2400,
          active: true,
        },
        {
          forge: "github",
          instance: "github.com",
          external_id: "9002",
          login: "mira",
          avatar_url: "",
          weekly_minutes: 2400,
          active: true,
        },
        {
          forge: "github",
          instance: "github.com",
          external_id: "9003",
          login: "otto",
          avatar_url: "",
          weekly_minutes: 2400,
          active: true,
        },
      ],
    ],
  ];
  for (const [key, value] of planningSettings) {
    run(
      "INSERT INTO state_setting (key, value, updated_at) VALUES (?, ?, ?)",
      [key, JSON.stringify(value), now],
    );
  }

  // --- Sign-in ----------------------------------------------------------
  // Better Auth stores timestamps in seconds and the admin role is what the
  // settings pages check; the account row lets the viewer resolve to dana.
  const nowSeconds = Math.floor(now / 1000);
  run(
    `INSERT INTO auth_user (
       id, name, email, emailVerified, image, role, banned,
       banReason, banExpires, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "user-dana",
      "Dana Okafor",
      "dana@example.com",
      1,
      "",
      "admin",
      0,
      null,
      null,
      nowSeconds,
      nowSeconds,
    ],
  );
  run(
    `INSERT INTO auth_session (
       id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent,
       impersonatedBy, userId
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "session-dana",
      nowSeconds + 30 * 24 * 60 * 60,
      SESSION_TOKEN,
      nowSeconds,
      nowSeconds,
      "127.0.0.1",
      "funnel screenshot harness",
      null,
      "user-dana",
    ],
  );
  run(
    `INSERT INTO auth_account (
       id, accountId, providerId, userId, accessToken, refreshToken, idToken,
       accessTokenExpiresAt, refreshTokenExpiresAt, scope, password,
       createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "account-dana",
      "9001",
      "github",
      "user-dana",
      null,
      null,
      null,
      null,
      null,
      "read:user,repo",
      null,
      nowSeconds,
      nowSeconds,
    ],
  );

  // --- Mirror: repo, people, labels, milestone -------------------------
  run(
    `INSERT INTO mirror_repo (
       id, forge, instance, external_id, org, name, url, etag, archived,
       degraded, last_polled_at, last_reconciled_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      "github",
      "github.com",
      "1001",
      REPO.org,
      REPO.name,
      "https://github.com/acme/widgets",
      null,
      0,
      0,
      now - 5 * MINUTE,
      now - DAY,
    ],
  );

  const users = [
    { id: 1, externalId: "9001", login: "dana" },
    { id: 2, externalId: "9002", login: "mira" },
    { id: 3, externalId: "9003", login: "otto" },
  ] as const;
  for (const user of users) {
    run(
      `INSERT INTO mirror_user (
         id, forge, instance, external_id, login, avatar_url, url
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        "github",
        "github.com",
        user.externalId,
        user.login,
        "",
        `https://github.com/${user.login}`,
      ],
    );
    run(
      "INSERT INTO mirror_repo_assignee (repo_id, user_id) VALUES (?, ?)",
      [1, user.id],
    );
  }

  for (const label of LABELS) {
    run(
      `INSERT INTO mirror_repo_label (repo_id, name, color, description)
       VALUES (?, ?, ?, ?)`,
      [1, label.name, label.color, label.description],
    );
  }

  run(
    `INSERT INTO mirror_milestone (
       repo_id, number, external_id, title, description, state, due_on,
       open_issues, closed_issues, creator_id, created_at, updated_at,
       closed_at, url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      1,
      "5001",
      "2026.10 · Bugzilla pass",
      "Table-first lists, numbered comments and the plain-text chrome.",
      "open",
      now + 14 * DAY,
      3,
      1,
      1,
      now - 10 * DAY,
      now - HOUR,
      null,
      "https://github.com/acme/widgets/milestone/1",
    ],
  );

  // --- Mirror: issues, labels, assignees --------------------------------
  for (const issue of ISSUES) {
    const createdAt = now - (issue.number + 2) * DAY;
    const updatedAt = now - issue.updatedOffsetMinutes * MINUTE;
    const closedAt =
      issue.closedOffsetDays === undefined
        ? null
        : now - issue.closedOffsetDays * DAY;

    run(
      `INSERT INTO mirror_thread (
         repo_id, number, external_id, kind, title, body, state, state_reason,
         author_id, milestone_number, url, created_at, updated_at, closed_at,
         status, impact, urgency, priority, priority_rank, size, blocked,
         label_conflict, is_epic
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        issue.number,
        String(7000 + issue.number),
        "issue",
        issue.title,
        issue.body,
        issue.state,
        issue.stateReason,
        issue.author,
        issue.milestone,
        `https://github.com/acme/widgets/issues/${issue.number}`,
        createdAt,
        updatedAt,
        closedAt,
        issue.status,
        issue.impact,
        issue.urgency,
        issue.priority,
        issue.priorityRank,
        issue.size,
        issue.blocked ? 1 : 0,
        0,
        issue.epic ? 1 : 0,
      ],
    );

    for (const label of issue.labels) {
      run(
        `INSERT INTO mirror_thread_label (repo_id, thread_number, label_name)
         VALUES (?, ?, ?)`,
        [1, issue.number, label],
      );
    }

    run(
      `INSERT INTO mirror_thread_assignee (repo_id, thread_number, user_id)
       VALUES (?, ?, ?)`,
      [1, issue.number, issue.assignee],
    );

    // Two comments per issue, oldest first.
    const comments = COMMENTS[issue.number] ?? [];
    comments.forEach((comment, index) => {
      run(
        `INSERT INTO mirror_comment (
           repo_id, thread_number, external_id, author_id, body, created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          1,
          issue.number,
          String(8000 + issue.number * 10 + index),
          comment.author,
          comment.body,
          now - comment.offsetMinutes * MINUTE,
          now - comment.offsetMinutes * MINUTE,
        ],
      );
    });
  }

  // --- Planning state ---------------------------------------------------
  // Current ISO week (Monday) so the week view stays populated whenever the
  // harness runs. Issues 1/2/3/6 are the sized, open work to schedule.
  const weekStart = currentWeekStart();
  for (const issueNumber of [1, 2, 3, 6]) {
    run(
      `INSERT INTO state_plan_item (
         org, name, issue_number, week_start, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [REPO.org, REPO.name, issueNumber, weekStart, now, now],
    );
  }

  // One durable work note so the issue page's Work notes panel is populated.
  run(
    `INSERT INTO state_work_note (
       id, org, name, issue_number, author_external_id, author_forge,
       author_instance, author_login, author_avatar_url, body, created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "work-note-1",
      REPO.org,
      REPO.name,
      1,
      "9001",
      "github",
      "github.com",
      "dana",
      "",
      [
        "## Repro notes",
        "",
        "- Safari 18.2 on macOS 15.2 drops the grid below 480px.",
        "- 1024px is fine; the media query is the only difference.",
        "",
        "Next: confirm the `sm` breakpoint with the design tokens branch.",
      ].join("\n"),
      now - HOUR,
      now - HOUR,
    ],
  );

  // The session cookie Better Auth expects: signed with the same secret the
  // server derives its HMAC key from. Only the name=value part is returned.
  const serialized = await serializeSignedCookie(
    "better-auth.session_token",
    SESSION_TOKEN,
    secret,
  );

  return { cookie: serialized.split(";")[0] as string, token: SESSION_TOKEN };
}

/**
 * Create `<dbPath>` from scratch and seed the demo instance.
 *
 * Refuses to touch an existing database: captures are a "before" snapshot, and
 * an accidental re-seed over a real DB would be destructive.
 */
export async function seed({ dbPath, secret }: SeedOptions): Promise<SeedResult> {
  if (existsSync(dbPath)) {
    throw new Error(`Refusing to seed an existing database: ${dbPath}`);
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath, { create: true });
  try {
    sqlite.run("PRAGMA foreign_keys = ON");
    sqlite.run("PRAGMA busy_timeout = 5000");
    migrate(sqlite);
    const result = seedRows(sqlite, secret);
    return await result;
  } finally {
    sqlite.close();
  }
}

/** Read `--name value` from argv. */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.main) {
  const out = option("out");
  if (!out) {
    console.error("Usage: bun scripts/screenshots/seed.ts --out <dir> [--db <path>] [--secret <secret>]");
    process.exit(1);
  }

  const dbPath = option("db") ?? join(out, DEFAULT_DB_NAME);
  const secret = option("secret") ?? process.env.FUNNEL_SECRET ?? DEFAULT_SECRET;

  const { cookie } = await seed({ dbPath, secret });
  console.error(`seeded ${dbPath}`);
  // stdout is only the cookie, so `--cookie "$(bun seed.ts ...)"` works.
  console.log(cookie);
}
