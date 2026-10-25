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
  DEFAULT_WORK_HOURS,
  defaultsFromHours,
  type WorkDefaultsInput,
} from "#lib/planning/availability";
import { isValidTimeZone } from "#lib/time/zoned";
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

/** The admin default working hours, in the persisted snake_case shape. */
export const DEFAULT_WORK_DEFAULTS: WorkDefaultsInput = defaultsFromHours(DEFAULT_WORK_HOURS);

/**
 * The persisted `planning.work_defaults` shape. Validated like a per-viewer
 * hours row: a real IANA zone, a non-empty ordered work window, unique ISO
 * weekdays and a buffer in `0..90`.
 */
export const workDefaultsInput = v.object({
  timezone: v.pipe(
    v.string("planning.work_defaults.timezone must be a string"),
    v.trim(),
    v.nonEmpty("planning.work_defaults.timezone must not be empty"),
    v.check(isValidTimeZone, "planning.work_defaults.timezone must be a valid IANA timezone"),
  ),
  start_minute: boundedInt("planning.work_defaults.start_minute", 0, 1440),
  end_minute: boundedInt("planning.work_defaults.end_minute", 0, 1440),
  work_days: v.pipe(
    v.array(boundedInt("planning.work_defaults.work_days", 1, 7)),
    v.minLength(1, "planning.work_defaults.work_days must not be empty"),
    v.check(
      (days) => new Set(days).size === days.length,
      "planning.work_defaults.work_days must not contain duplicates",
    ),
  ),
  buffer_percent: boundedInt("planning.work_defaults.buffer_percent", 0, 90),
});

/** Working hours plus the cross-field `start < end` rule. */
const workDefaults = v.pipe(
  workDefaultsInput,
  v.check(
    (input) => input.start_minute < input.end_minute,
    "planning.work_defaults.start_minute must be less than end_minute",
  ),
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

/** The planning section: estimates, cycle shape, work defaults and the roster. */
export const planningInput = v.object({
  size_minutes: sizeMinutes,
  allocation_percent: allocationPercent,
  cycle_weeks: cycleWeeks,
  cycle_anchor: cycleAnchor,
  work_defaults: workDefaults,
  maintainers: v.array(maintainerInput),
});

export type PlanningInput = v.InferOutput<typeof planningInput>;

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
  "intake.default_repo": {
    schema: v.optional(repoName),
    default: undefined as string | undefined,
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
  "planning.work_defaults": {
    schema: workDefaults,
    default: DEFAULT_WORK_DEFAULTS,
  },
  "planning.maintainers": {
    schema: v.array(maintainerInput),
    default: [] as MaintainerInput[],
  },
} as const;

/** A persisted setting key, e.g. `sync.history_days`. */
export type SettingKey = keyof typeof defs;

/** The JSON-serializable shape of all persisted settings. */
export interface Settings {
  repos: RepoInput[];
  projects: ProjectInput[];
  intake: { default_repo?: string };
  sync: {
    history_days: number;
    poll_interval_active_seconds: number;
    poll_interval_idle_seconds: number;
  };
  board: { done_days: number; wip_limits: Record<string, number> };
  session: { idle_days: number };
  notifications: { enabled: boolean; native: boolean; new_intake: boolean };
  planning: {
    size_minutes: SizeMinutes;
    allocation_percent: number;
    cycle_weeks: number;
    cycle_anchor: string;
    work_defaults: WorkDefaultsInput;
    maintainers: MaintainerInput[];
  };
}

/** Raised when a write carries a value its key's schema rejects. */
export class SettingsError extends Error {
  override name = "SettingsError";

  constructor(readonly issues: string[]) {
    super(`Invalid settings: ${issues.join("; ")}`);
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
  intake: v.object({ default_repo: v.optional(repoName) }),
  sync: v.object({
    history_days: count("sync.history_days"),
    poll_interval_active_seconds: count("sync.poll_interval_active_seconds"),
    poll_interval_idle_seconds: count("sync.poll_interval_idle_seconds"),
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

/** Copy work defaults so a caller cannot mutate the registry default. */
function cloneWorkDefaults(input: WorkDefaultsInput): WorkDefaultsInput {
  return { ...input, work_days: [...input.work_days] };
}

/** Read and compose every persisted setting, applying per-key defaults. */
export function readSettings(): Settings {
  const rows = readRows();
  return {
    repos: readKey(rows, "repos") as RepoInput[],
    projects: readKey(rows, "projects") as ProjectInput[],
    intake: {
      default_repo: readKey(rows, "intake.default_repo") as string | undefined,
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
      work_defaults: cloneWorkDefaults(
        readKey(rows, "planning.work_defaults") as WorkDefaultsInput,
      ),
      maintainers: (
        readKey(rows, "planning.maintainers") as MaintainerInput[]
      ).map((maintainer) => ({ ...maintainer })),
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
    work_defaults: DEFAULT_WORK_DEFAULTS,
    maintainers: [] as MaintainerInput[],
  };
  return [
    ["repos", input.repos],
    ["projects", input.projects],
    ["intake.default_repo", input.intake.default_repo],
    ["sync.history_days", input.sync.history_days],
    [
      "sync.poll_interval_active_seconds",
      input.sync.poll_interval_active_seconds,
    ],
    [
      "sync.poll_interval_idle_seconds",
      input.sync.poll_interval_idle_seconds,
    ],
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
    ["planning.work_defaults", planning.work_defaults],
    ["planning.maintainers", planning.maintainers],
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
  const issues: string[] = [];
  const encoded: [SettingKey, string | undefined][] = [];

  for (const [key, value] of entries) {
    const result = v.safeParse(defs[key].schema, value);
    if (!result.success) {
      issues.push(...result.issues.map((issue) => `${key}: ${issue.message}`));
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
