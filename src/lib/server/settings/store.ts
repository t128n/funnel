/**
 * Instance settings persistence (SPEC §4, §10).
 *
 * Replaces the former `funnel.config.yaml`: settings live in the SQLite
 * `state_setting` table as normalized dotted-key rows whose values are
 * JSON-encoded. This module owns three things:
 *
 *  1. the shared validation primitives (`repoName`, `shortcode`, `count`, ...)
 *     reused by {@link file://./../config.ts `configSchema`};
 *  2. the key registry — every setting key declares a valibot schema and a
 *     default, so a missing or corrupt row degrades to the default instead of
 *     failing the whole load;
 *  3. the read/write primitives, plus the composition of flat rows into the
 *     typed {@link Settings} object.
 *
 * Writes are validated per key here. Cross-field rules that span keys (unique
 * repository shortcodes, `intake.default_repo` membership) are enforced by
 * `configSchema` when the composed config is loaded.
 *
 * Lists (`repos`, `projects`, `planning.maintainers`) live under a single key
 * as a JSON array; scalars use one row each. `github.url` / `github.api_url`
 * are *not* stored here: they
 * are deploy/bootstrap values read from the environment (see `src/env.ts`).
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";
import {
  buildReservedLabels,
  isValidLabelPrefix,
  LABEL_PREFIX_MAX_LENGTH,
  normalizeLabelPrefix,
} from "#lib/labels";
import type { SettingsIssue } from "#lib/settings-feedback";
import { db } from "#lib/server/db/index";
import { stateSetting } from "#lib/server/db/schema";
import { createLogger } from "#lib/server/log";

const log = createLogger({ component: "settings" });

// ---------------------------------------------------------------------------
// Shared validation primitives
// ---------------------------------------------------------------------------

// `owner/name` on GitHub. Owner segments are alphanumerics/hyphens; repo names
// additionally allow dots and underscores. Kept intentionally permissive here
// (GitHub is the source of truth) but strict enough to reject junk.
const repoPattern = /^[\w.-]+\/[\w.-]+$/;

/** A GitHub repository in `owner/name` form. */
export const repoName = v.pipe(
  v.string("Repository must be a string"),
  v.trim(),
  v.regex(repoPattern, "Repository must be in `owner/name` form"),
);

/** The short project key shown on cards (e.g. `FIT-12`), at most 6 chars. */
export const shortcode = v.pipe(
  v.string("Shortcode must be a string"),
  v.trim(),
  v.regex(
    /^[A-Za-z][A-Za-z0-9]{0,5}$/,
    "Shortcode must start with a letter and be at most 6 characters",
  ),
);

/** Non-negative integer with a label used in validation messages. */
export const count = (label: string) =>
  v.pipe(
    v.number(`${label} must be a number`),
    v.integer(`${label} must be an integer`),
    v.minValue(0, `${label} must be >= 0`),
  );

/** A configured repository as stored (shortcode is optional until normalized). */
export type RepoInput = string | { repo: string; shortcode?: string };

/** A configured project as stored: a label string or a structured mapping. */
export type ProjectInput = string | { label: string; name?: string };

export const repoEntry = v.union([
  repoName,
  v.object({ repo: repoName, shortcode: v.optional(shortcode) }),
]);

export const projectInput = v.union([
  v.pipe(v.string(), v.trim(), v.nonEmpty("Project label must not be empty")),
  v.object({
    label: v.pipe(v.string(), v.trim(), v.nonEmpty("Project label must not be empty")),
    name: v.optional(v.pipe(v.string(), v.trim())),
  }),
]);

/** Open workflow stages that can carry a Work-in-Progress cap. */
export const WIP_STAGES = ["backlog", "todo", "in-progress", "in-review"] as const;

/**
 * The optional global prefix for reserved GitHub labels.
 *
 * Trimmed and trailing-hyphen normalized (`funnel-` and `funnel` both mean
 * `funnel`), then restricted to letters/digits separated by single hyphens.
 * Empty means the unprefixed vocabulary. The check for duplicate resulting
 * names is defensive: the fixed vocabulary cannot collide under a valid prefix,
 * but a future separator/override must never silently create two `todo`s.
 */
export const labelPrefix = v.pipe(
  v.string("labels.prefix must be a string"),
  v.transform(normalizeLabelPrefix),
  v.maxLength(
    LABEL_PREFIX_MAX_LENGTH,
    `labels.prefix must be at most ${LABEL_PREFIX_MAX_LENGTH} characters`,
  ),
  v.check(
    isValidLabelPrefix,
    "labels.prefix may contain only letters, digits and single hyphens",
  ),
  v.check((prefix) => {
    const names = buildReservedLabels(prefix).map((label) =>
      label.name.toLowerCase(),
    );
    return new Set(names).size === names.length;
  }, "labels.prefix must not produce duplicate reserved label names"),
);

// ---------------------------------------------------------------------------
// Planning primitives
// ---------------------------------------------------------------------------

/** Funnel's estimate labels, in ascending order. */
export const SIZE_KEYS = ["sm", "md", "lg"] as const;

/** One estimate label. */
export type SizeKey = (typeof SIZE_KEYS)[number];

/** Minutes per size label, e.g. `{ sm: 120, md: 240, lg: 480 }`. */
export type SizeMinutes = Record<SizeKey, number>;

/** The instance-wide default estimate mapping (2h, 4h, 8h). */
export const DEFAULT_SIZE_MINUTES: SizeMinutes = { sm: 120, md: 240, lg: 480 };

/** Default share of a maintainer's net hours that planning may allocate. */
export const DEFAULT_ALLOCATION_PERCENT = 60;

/** Default length of one planning cycle, in weeks. */
export const DEFAULT_CYCLE_WEEKS = 2;

/** The Monday that anchors cycle numbering. */
export const DEFAULT_CYCLE_ANCHOR = "2024-01-01";

/**
 * True for a real `YYYY-MM-DD` calendar date that falls on a Monday (UTC).
 * Used to validate `planning.cycle_anchor` and, later, week identifiers.
 */
export function isMondayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCDay() === 1
  );
}

/** Integer with an inclusive lower and upper bound. */
const boundedInt = (label: string, min: number, max: number) =>
  v.pipe(
    v.number(`${label} must be a number`),
    v.integer(`${label} must be an integer`),
    v.minValue(min, `${label} must be >= ${min}`),
    v.maxValue(max, `${label} must be <= ${max}`),
  );

const sizeMinutes = v.object({
  sm: count("planning.size_minutes.sm"),
  md: count("planning.size_minutes.md"),
  lg: count("planning.size_minutes.lg"),
});

const allocationPercent = boundedInt("planning.allocation_percent", 1, 100);

const cycleWeeks = boundedInt("planning.cycle_weeks", 1, 52);

const cycleAnchor = v.pipe(
  v.string("planning.cycle_anchor must be a string"),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "planning.cycle_anchor must be YYYY-MM-DD"),
  v.check(isMondayDate, "planning.cycle_anchor must be a Monday"),
);

/** One row of the maintainer roster: a mirrored forge person. */
export const maintainerInput = v.object({
  forge: v.pipe(
    v.string("Maintainer forge must be a string"),
    v.trim(),
    v.nonEmpty("Maintainer forge must not be empty"),
  ),
  instance: v.pipe(
    v.string("Maintainer instance must be a string"),
    v.trim(),
    v.nonEmpty("Maintainer instance must not be empty"),
  ),
  external_id: v.pipe(
    v.string("Maintainer external_id must be a string"),
    v.trim(),
    v.nonEmpty("Maintainer external_id must not be empty"),
  ),
  login: v.pipe(
    v.string("Maintainer login must be a string"),
    v.trim(),
    v.nonEmpty("Maintainer login must not be empty"),
  ),
  avatar_url: v.optional(v.nullable(v.string())),
  weekly_minutes: count("Maintainer weekly_minutes"),
  active: v.boolean("Maintainer active must be a boolean"),
});

export type MaintainerInput = v.InferOutput<typeof maintainerInput>;

/** The planning section: estimates, cycle shape and the roster. */
export const planningInput = v.object({
  size_minutes: sizeMinutes,
  allocation_percent: allocationPercent,
  cycle_weeks: cycleWeeks,
  cycle_anchor: cycleAnchor,
  maintainers: v.array(maintainerInput),
});

export type PlanningInput = v.InferOutput<typeof planningInput>;

// ---------------------------------------------------------------------------
// Attention rules (issue #37)
// ---------------------------------------------------------------------------

/** The four configurable triage thresholds, in days; `0` disables a rule. */
export interface AttentionSettings {
  /** Days before an unanswered issue breaches the first-response rule. */
  first_response_days: number;
  /** Days without an update before an open issue is stale. */
  stale_open_days: number;
  /** Days past a blocked issue's re-check date before it breaches. */
  recheck_cadence_days: number;
  /** Calendar days an issue may wait on someone else. */
  waiting_days: number;
}

/** Defaults preserve Funnel's pre-#37 behaviour; all four rules start enabled. */
export const DEFAULT_ATTENTION: AttentionSettings = {
  first_response_days: 3,
  stale_open_days: 30,
  recheck_cadence_days: 7,
  waiting_days: 7,
};

/** Validation for the attention section, shared with `configSchema`. */
export const attentionInput = v.object({
  first_response_days: count("attention.first_response_days"),
  stale_open_days: count("attention.stale_open_days"),
  recheck_cadence_days: count("attention.recheck_cadence_days"),
  waiting_days: count("attention.waiting_days"),
});

// ---------------------------------------------------------------------------
// Intake abuse controls
// ---------------------------------------------------------------------------

/**
 * Per-IP submission caps enforced by `#lib/server/intake/rate-limit`. Both
 * windows are fixed: a request counts in the current minute and/or hour
 * bucket. `0` disables that window.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 10;
export const DEFAULT_RATE_LIMIT_PER_HOUR = 60;

/** Whether the hidden `company_website` honeypot is checked. */
export const DEFAULT_HONEYPOT = true;

// ---------------------------------------------------------------------------
// Key registry
// ---------------------------------------------------------------------------

/**
 * Every persisted setting: its value schema (used for both the write and the
 * defensive read) and the default applied when the row is absent.
 */
const defs = {
  repos: { schema: v.array(repoEntry), default: [] as RepoInput[] },
  projects: { schema: v.array(projectInput), default: [] as ProjectInput[] },
  "labels.prefix": { schema: labelPrefix, default: "" },
  "intake.default_repo": {
    schema: v.optional(repoName),
    default: undefined as string | undefined,
  },
  "intake.rate_limit_per_minute": {
    schema: count("intake.rate_limit_per_minute"),
    default: DEFAULT_RATE_LIMIT_PER_MINUTE,
  },
  "intake.rate_limit_per_hour": {
    schema: count("intake.rate_limit_per_hour"),
    default: DEFAULT_RATE_LIMIT_PER_HOUR,
  },
  "intake.honeypot": {
    schema: v.boolean("intake.honeypot must be a boolean"),
    default: DEFAULT_HONEYPOT,
  },
  "sync.history_days": { schema: count("sync.history_days"), default: 90 },
  "sync.poll_interval_active_seconds": {
    schema: count("sync.poll_interval_active_seconds"),
    default: 30,
  },
  "sync.poll_interval_idle_seconds": {
    schema: count("sync.poll_interval_idle_seconds"),
    default: 300,
  },
  "sync.pr_in_review": {
    schema: v.boolean("sync.pr_in_review must be a boolean"),
    default: false,
  },
  "sync.pr_done": {
    schema: v.boolean("sync.pr_done must be a boolean"),
    default: false,
  },
  "board.done_days": { schema: count("board.done_days"), default: 14 },
  "board.wip_limits": {
    schema: v.record(v.picklist(WIP_STAGES), count("board.wip_limits")),
    default: {} as Record<string, number>,
  },
  "session.idle_days": { schema: count("session.idle_days"), default: 30 },
  "notifications.enabled": {
    schema: v.boolean("notifications.enabled must be a boolean"),
    default: true,
  },
  "notifications.native": {
    schema: v.boolean("notifications.native must be a boolean"),
    default: true,
  },
  "notifications.new_intake": {
    schema: v.boolean("notifications.new_intake must be a boolean"),
    default: true,
  },
  "planning.size_minutes": {
    schema: sizeMinutes,
    default: DEFAULT_SIZE_MINUTES,
  },
  "planning.allocation_percent": {
    schema: allocationPercent,
    default: DEFAULT_ALLOCATION_PERCENT,
  },
  "planning.cycle_weeks": { schema: cycleWeeks, default: DEFAULT_CYCLE_WEEKS },
  "planning.cycle_anchor": { schema: cycleAnchor, default: DEFAULT_CYCLE_ANCHOR },
  "planning.maintainers": {
    schema: v.array(maintainerInput),
    default: [] as MaintainerInput[],
  },
  "attention.first_response_days": {
    schema: count("attention.first_response_days"),
    default: DEFAULT_ATTENTION.first_response_days,
  },
  "attention.stale_open_days": {
    schema: count("attention.stale_open_days"),
    default: DEFAULT_ATTENTION.stale_open_days,
  },
  "attention.recheck_cadence_days": {
    schema: count("attention.recheck_cadence_days"),
    default: DEFAULT_ATTENTION.recheck_cadence_days,
  },
  "attention.waiting_days": {
    schema: count("attention.waiting_days"),
    default: DEFAULT_ATTENTION.waiting_days,
  },
} as const;

/** A persisted setting key, e.g. `sync.history_days`. */
export type SettingKey = keyof typeof defs;

/** The JSON-serializable shape of all persisted settings. */
export interface Settings {
  repos: RepoInput[];
  projects: ProjectInput[];
  labels: { prefix: string };
  intake: {
    default_repo?: string;
    /** Per-IP submissions allowed per fixed minute window; `0` disables it. */
    rate_limit_per_minute: number;
    /** Per-IP submissions allowed per fixed hour window; `0` disables it. */
    rate_limit_per_hour: number;
    /** Check the hidden form honeypot. */
    honeypot: boolean;
  };
  sync: {
    history_days: number;
    poll_interval_active_seconds: number;
    poll_interval_idle_seconds: number;
    /** Opt-in: an open linked PR moves an open issue to In Review. */
    pr_in_review: boolean;
    /** Opt-in: all linked PRs merged/closed closes the issue as completed. */
    pr_done: boolean;
  };
  board: { done_days: number; wip_limits: Record<string, number> };
  session: { idle_days: number };
  notifications: { enabled: boolean; native: boolean; new_intake: boolean };
  planning: {
    size_minutes: SizeMinutes;
    allocation_percent: number;
    cycle_weeks: number;
    cycle_anchor: string;
    maintainers: MaintainerInput[];
  };
  attention: AttentionSettings;
}

/** Raised when a write carries a value its key's schema rejects. */
export class SettingsError extends Error {
  override name = "SettingsError";

  constructor(readonly issues: SettingsIssue[]) {
    super(
      `Invalid settings: ${issues
        .map((issue) => `${issue.key ? `${issue.key}: ` : ""}${issue.message}`)
        .join("; ")}`,
    );
  }
}

/**
 * The full settings payload a write expects. Mirrors {@link Settings} but with
 * validated input types; the page action parses the request body against
 * {@link settingsInputSchema} before calling {@link writeSettings}.
 */
export const settingsInputSchema = v.object({
  repos: v.array(repoEntry),
  projects: v.array(projectInput),
  // Optional so settings written before this section (and patches from older
  // test fixtures) default to the unprefixed vocabulary instead of failing.
  labels: v.optional(v.object({ prefix: labelPrefix }), { prefix: "" }),
  intake: v.object({
    default_repo: v.optional(repoName),
    // Optional so patches and fixtures written before the abuse controls keep
    // validating; `toEntries` fills in the defaults.
    rate_limit_per_minute: v.optional(
      count("intake.rate_limit_per_minute"),
    ),
    rate_limit_per_hour: v.optional(count("intake.rate_limit_per_hour")),
    honeypot: v.optional(v.boolean("intake.honeypot must be a boolean")),
  }),
  sync: v.object({
    history_days: count("sync.history_days"),
    poll_interval_active_seconds: count("sync.poll_interval_active_seconds"),
    poll_interval_idle_seconds: count("sync.poll_interval_idle_seconds"),
    // Optional so fixtures written before issue #28 keep validating; the
    // compose step and write path apply the disabled default.
    pr_in_review: v.optional(v.boolean("sync.pr_in_review must be a boolean")),
    pr_done: v.optional(v.boolean("sync.pr_done must be a boolean")),
  }),
  board: v.object({
    done_days: count("board.done_days"),
    wip_limits: v.record(v.picklist(WIP_STAGES), count("board.wip_limits")),
  }),
  session: v.object({ idle_days: count("session.idle_days") }),
  notifications: v.object({
    enabled: v.boolean("notifications.enabled must be a boolean"),
    native: v.boolean("notifications.native must be a boolean"),
    new_intake: v.boolean("notifications.new_intake must be a boolean"),
  }),
  planning: planningInput,
  // Optional so settings patches and test fixtures written before issue #37
  // keep validating; `toEntries` fills in the defaults.
  attention: v.optional(attentionInput),
});

export type SettingsInput = v.InferOutput<typeof settingsInputSchema>;

/**
 * A partial settings payload: one or more top-level sections to update. Used by
 * the `/settings` sections, which each save only their own slice; the merge
 * with the current settings happens in `#lib/server/settings/apply`.
 */
export const settingsPatchSchema = v.partial(settingsInputSchema);

export type SettingsPatch = v.InferOutput<typeof settingsPatchSchema>;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Raw `key -> JSON string` view of every row. */
function readRows(): Map<string, string> {
  const rows = db.select().from(stateSetting).all();
  return new Map(rows.map((row) => [row.key, row.value]));
}

/**
 * Decode and validate one key, falling back to its default when the row is
 * missing, unparseable, or fails its schema. A corrupt row never aborts the
 * whole load: it is logged and degraded to the default.
 */
function readKey(rows: Map<string, string>, key: SettingKey): unknown {
  const raw = rows.get(key);
  if (raw === undefined) return defs[key].default;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn({ key }, "ignoring unparseable setting value");
    return defs[key].default;
  }

  const result = v.safeParse(defs[key].schema, parsed);
  if (!result.success) {
    log.warn(
      { key, issues: result.issues.map((issue) => issue.message) },
      "ignoring invalid setting value",
    );
    return defs[key].default;
  }
  return result.output;
}

/** Read and compose every persisted setting, applying per-key defaults. */
export function readSettings(): Settings {
  const rows = readRows();
  return {
    repos: readKey(rows, "repos") as RepoInput[],
    projects: readKey(rows, "projects") as ProjectInput[],
    labels: {
      prefix: readKey(rows, "labels.prefix") as string,
    },
    intake: {
      default_repo: readKey(rows, "intake.default_repo") as string | undefined,
      rate_limit_per_minute: readKey(
        rows,
        "intake.rate_limit_per_minute",
      ) as number,
      rate_limit_per_hour: readKey(
        rows,
        "intake.rate_limit_per_hour",
      ) as number,
      honeypot: readKey(rows, "intake.honeypot") as boolean,
    },
    sync: {
      history_days: readKey(rows, "sync.history_days") as number,
      poll_interval_active_seconds: readKey(
        rows,
        "sync.poll_interval_active_seconds",
      ) as number,
      poll_interval_idle_seconds: readKey(
        rows,
        "sync.poll_interval_idle_seconds",
      ) as number,
      pr_in_review: readKey(rows, "sync.pr_in_review") as boolean,
      pr_done: readKey(rows, "sync.pr_done") as boolean,
    },
    board: {
      done_days: readKey(rows, "board.done_days") as number,
      wip_limits: readKey(rows, "board.wip_limits") as Record<string, number>,
    },
    session: {
      idle_days: readKey(rows, "session.idle_days") as number,
    },
    notifications: {
      enabled: readKey(rows, "notifications.enabled") as boolean,
      native: readKey(rows, "notifications.native") as boolean,
      new_intake: readKey(rows, "notifications.new_intake") as boolean,
    },
    planning: {
      size_minutes: {
        ...(readKey(rows, "planning.size_minutes") as SizeMinutes),
      },
      allocation_percent: readKey(
        rows,
        "planning.allocation_percent",
      ) as number,
      cycle_weeks: readKey(rows, "planning.cycle_weeks") as number,
      cycle_anchor: readKey(rows, "planning.cycle_anchor") as string,
      maintainers: (
        readKey(rows, "planning.maintainers") as MaintainerInput[]
      ).map((maintainer) => ({ ...maintainer })),
    },
    attention: {
      first_response_days: readKey(
        rows,
        "attention.first_response_days",
      ) as number,
      stale_open_days: readKey(rows, "attention.stale_open_days") as number,
      recheck_cadence_days: readKey(
        rows,
        "attention.recheck_cadence_days",
      ) as number,
      waiting_days: readKey(rows, "attention.waiting_days") as number,
    },
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Flatten the nested payload into `key -> raw value` entries. */
function toEntries(input: SettingsInput): [SettingKey, unknown][] {
  // Tolerate callers that predate the planning section (test fixtures and
  // direct store callers): absent means "write the defaults".
  const planning = input.planning ?? {
    size_minutes: DEFAULT_SIZE_MINUTES,
    allocation_percent: DEFAULT_ALLOCATION_PERCENT,
    cycle_weeks: DEFAULT_CYCLE_WEEKS,
    cycle_anchor: DEFAULT_CYCLE_ANCHOR,
    maintainers: [] as MaintainerInput[],
  };
  const labels = input.labels ?? { prefix: "" };
  const attention = input.attention ?? DEFAULT_ATTENTION;
  const intake = input.intake;
  return [
    ["repos", input.repos],
    ["projects", input.projects],
    ["labels.prefix", labels.prefix],
    ["intake.default_repo", intake.default_repo],
    [
      "intake.rate_limit_per_minute",
      intake.rate_limit_per_minute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    ],
    [
      "intake.rate_limit_per_hour",
      intake.rate_limit_per_hour ?? DEFAULT_RATE_LIMIT_PER_HOUR,
    ],
    ["intake.honeypot", intake.honeypot ?? DEFAULT_HONEYPOT],
    ["sync.history_days", input.sync.history_days],
    [
      "sync.poll_interval_active_seconds",
      input.sync.poll_interval_active_seconds,
    ],
    [
      "sync.poll_interval_idle_seconds",
      input.sync.poll_interval_idle_seconds,
    ],
    ["sync.pr_in_review", input.sync.pr_in_review ?? false],
    ["sync.pr_done", input.sync.pr_done ?? false],
    ["board.done_days", input.board.done_days],
    ["board.wip_limits", input.board.wip_limits],
    ["session.idle_days", input.session.idle_days],
    ["notifications.enabled", input.notifications.enabled],
    ["notifications.native", input.notifications.native],
    ["notifications.new_intake", input.notifications.new_intake],
    ["planning.size_minutes", planning.size_minutes],
    ["planning.allocation_percent", planning.allocation_percent],
    ["planning.cycle_weeks", planning.cycle_weeks],
    ["planning.cycle_anchor", planning.cycle_anchor],
    ["planning.maintainers", planning.maintainers],
    ["attention.first_response_days", attention.first_response_days],
    ["attention.stale_open_days", attention.stale_open_days],
    ["attention.recheck_cadence_days", attention.recheck_cadence_days],
    ["attention.waiting_days", attention.waiting_days],
  ];
}

/**
 * Persist a full settings payload in a single transaction.
 *
 * Each value is re-validated against its key's schema (defensive: the public
 * shape is already typed, but this guards direct callers and JSON boundaries).
 * An `undefined` value (an unset `intake.default_repo`) deletes the row rather
 * than storing `null`. Throws {@link SettingsError} listing every issue.
 */
export function writeSettings(input: SettingsInput): void {
  const entries = toEntries(input);
  const issues: SettingsIssue[] = [];
  const encoded: [SettingKey, string | undefined][] = [];

  for (const [key, value] of entries) {
    const result = v.safeParse(defs[key].schema, value);
    if (!result.success) {
      issues.push(...result.issues.map((issue) => ({ key, message: issue.message })));
      continue;
    }
    // `undefined` is not JSON-serializable and means "unset this key".
    encoded.push([
      key,
      result.output === undefined ? undefined : JSON.stringify(result.output),
    ]);
  }
  if (issues.length > 0) throw new SettingsError(issues);

  const now = Date.now();
  db.transaction((tx) => {
    for (const [key, value] of encoded) {
      if (value === undefined) {
        tx.delete(stateSetting).where(eq(stateSetting.key, key)).run();
        continue;
      }
      tx.insert(stateSetting)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: stateSetting.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
  });
}

/** Remove every persisted setting (tests, or a full reset). */
export function clearSettings(): void {
  db.delete(stateSetting).run();
}
