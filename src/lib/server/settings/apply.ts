/**
 * Apply an instance-settings change (SPEC §4, §10).
 *
 * The `/settings` sections each save only their own slice, so the entry point is
 * a *patch*: it is merged onto the current settings, validated as one composed
 * config (the same cross-field rules as a startup load), persisted, and then
 * made visible everywhere in the long-lived process:
 *
 *  1. the patch is merged and validated via {@link validateConfig};
 *  2. {@link writeSettings} persists the merged rows in a transaction;
 *  3. the cached {@link getConfig} promise is dropped so the next read reflects
 *     the new values;
 *  4. the sync scheduler is told to re-read config, so added/removed repos and
 *     retuned intervals take effect on the next tick;
 *  5. a `settings` SSE event prompts every open cockpit to refresh its `load`
 *     data (host links, board window, WIP caps, project grouping, ...).
 *
 * Kept separate from `store.ts` so the persistence layer stays free of
 * config/worker dependencies (which would form an import cycle).
 */
import * as v from "valibot";
import type { SettingsIssue } from "#lib/settings-feedback";
import {
  ConfigError,
  resetConfigCache,
  validateConfig,
} from "#lib/server/config";
import { publish } from "#lib/server/sync/events";
import { notifyConfigChanged } from "#lib/server/sync/worker";
import {
  readSettings,
  SettingsError,
  settingsPatchSchema,
  writeSettings,
  type SettingsInput,
  type SettingsPatch,
} from "./store";

/** Outcome of a settings save, shaped for a SvelteKit form action. */
export type SettingsSaveResult =
  | { ok: true }
  | { ok: false; status: number; message: string; issues: SettingsIssue[] };

/**
 * Convert valibot issues to the settings action shape. The path is the only
 * stable field identity the UI can use; the raw message stays in logs while
 * the client turns it into a visible label.
 */
function toIssues(issues: readonly v.BaseIssue<unknown>[]): SettingsIssue[] {
  return issues.map((issue) => {
    const path = issue.path
      ?.map((item) => (typeof item.key === "symbol" ? "" : String(item.key)))
      .filter(Boolean)
      .join(".");
    // Cross-field `v.check` issues have a root path but still name the setting
    // they concern in the message; keep that key so the UI can label the field.
    const key = path || issue.message.match(/\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b/)?.[0];
    return {
      ...(key ? { key } : {}),
      message: issue.message,
    };
  });
}

/**
 * Validate a raw patch (e.g. a form's JSON payload) and apply it. Never throws
 * for user errors: validation and consistency failures come back as an
 * {@link SettingsSaveResult} the action turns into `fail(...)`.
 */
export function saveSettings(raw: unknown): SettingsSaveResult {
  const parsed = v.safeParse(settingsPatchSchema, raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Settings could not be saved",
      issues: toIssues(parsed.issues),
    };
  }

  try {
    applySettings(parsed.output);
  } catch (error) {
    if (error instanceof SettingsError) {
      return {
        ok: false,
        status: 400,
        message: "Some settings need attention",
        issues: error.issues,
      };
    }
    if (error instanceof ConfigError) {
      const cause = (error as { cause?: unknown }).cause;
      return {
        ok: false,
        status: 400,
        message: "Some settings need attention",
        issues: Array.isArray(cause)
          ? toIssues(cause as v.BaseIssue<unknown>[])
          : [],
      };
    }
    throw error;
  }

  return { ok: true };
}

/** Merge a patch onto the current settings and persist the result. */
export function applySettings(patch: SettingsPatch): void {
  const merged = { ...readSettings(), ...patch } as SettingsInput;
  const validated = validateConfig(merged);
  const { github: _host, ...settings } = validated;
  writeSettings(settings as SettingsInput);
  resetConfigCache();
  notifyConfigChanged();
  publish({ type: "settings" });
}
