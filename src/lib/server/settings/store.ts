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
 * Lists (`repos`, `projects`) live under a single key as a JSON array; scalars
 * use one row each. `github.url` / `github.api_url` are *not* stored here: they
 * are deploy/bootstrap values read from the environment (see `src/env.ts`).
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";
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
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Flatten the nested payload into `key -> raw value` entries. */
function toEntries(input: SettingsInput): [SettingKey, unknown][] {
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
