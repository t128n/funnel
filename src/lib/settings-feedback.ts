/**
 * Human-readable presentation for instance-settings validation failures.
 *
 * Server validation deliberately speaks in dotted setting keys so logs can
 * identify the stored row. The settings UI must not show that vocabulary:
 * every issue is mapped to the visible field label, its DOM selector and a
 * single sentence without internal keys.
 */
import { STATUS_OPTIONS } from "#lib/labels";

type WipStage = "backlog" | "todo" | "in-progress" | "in-review";

/** One validator issue as returned by a settings save action. */
export interface SettingsIssue {
  /** Dotted setting key, e.g. `session.idle_days`, when one can be derived. */
  key?: string;
  /** Raw validator message. May contain the dotted key. */
  message: string;
}

/** The `fail(...)` shape the `/settings/*` save actions return. */
export interface SettingsFormResult {
  message?: string;
  issues?: SettingsIssue[];
}

/** The heading used once per failed save. */
export const SETTINGS_FAILURE_SUMMARY = "Settings could not be saved";

interface FieldTarget {
  label: string;
  selector?: string;
}

interface DescribedSettingsIssue extends SettingsIssue {
  /** Stable DOM id for the list item used by `aria-describedby`. */
  id: string;
  /** Human-readable, single-sentence message. */
  text: string;
  label?: string;
  selector?: string;
}

const FIELD_TARGETS: Record<string, FieldTarget> = {
  "session.idle_days": { label: "Idle lifetime", selector: "#session-idle-days" },
  "sync.history_days": { label: "History window", selector: "#sync-history-days" },
  "sync.poll_interval_active_seconds": {
    label: "Active poll interval",
    selector: "#sync-active-seconds"
  },
  "sync.poll_interval_idle_seconds": {
    label: "Idle poll interval",
    selector: "#sync-idle-seconds"
  },
  "board.done_days": { label: "Done retention", selector: "#board-done-days" },
  "board.wip_limits": { label: "Work-in-progress limit" },
  "intake.default_repo": { label: "Default repository", selector: "#intake-default-repo" },
  "notifications.enabled": { label: "Notifications", selector: "#notification-enabled" },
  "notifications.native": {
    label: "Browser notifications",
    selector: "#notification-native"
  },
  "notifications.new_intake": {
    label: "New intake submissions",
    selector: "#notification-new_intake"
  },
  "planning.size_minutes.sm": { label: "Small estimate", selector: "#planning-size-sm" },
  "planning.size_minutes.md": { label: "Medium estimate", selector: "#planning-size-md" },
  "planning.size_minutes.lg": { label: "Large estimate", selector: "#planning-size-lg" },
  "planning.allocation_percent": {
    label: "Allocation",
    selector: "#planning-allocation"
  },
  "planning.maintainers": { label: "Maintainer roster" },
  repos: { label: "Repositories", selector: "#settings-repo-0" },
  projects: { label: "Projects", selector: "#settings-project-0" }
};

const FIELD_KEYS = Object.keys(FIELD_TARGETS).sort((a, b) => b.length - a.length);

const WIP_LABELS = new Map(STATUS_OPTIONS.map((option) => [option.value, option.label]));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function humanizeKey(key: string): string {
  const last = key.split(".").pop() ?? key;
  const words = last.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Map a validator path (or a key mentioned in the message) to a visible field. */
function inferKey(issue: SettingsIssue): string | undefined {
  if (issue.key) return issue.key;

  const message = issue.message;
  const mentioned = FIELD_KEYS.find((key) => message.includes(key));
  if (mentioned) return mentioned;

  if (/shortcodes must be unique/i.test(message)) return "repos";
  if (/default_repo must be one of/i.test(message)) return "intake.default_repo";
  if (/maintainers must be unique/i.test(message)) return "planning.maintainers";
  return undefined;
}

function fieldFor(key: string | undefined): FieldTarget | undefined {
  if (!key) return undefined;

  if (key === "repos" || key.startsWith("repos.")) {
    const [, index, property] = key.split(".");
    if (index !== undefined && /^\d+$/.test(index)) {
      if (property === "shortcode") {
        return {
          label: `Shortcode for repository ${Number(index) + 1}`,
          selector: `#settings-repo-shortcode-${index}`
        };
      }
      return { label: `Repository ${Number(index) + 1}`, selector: `#settings-repo-${index}` };
    }
    return FIELD_TARGETS.repos;
  }

  if (key === "projects" || key.startsWith("projects.")) {
    const [, index] = key.split(".");
    if (index !== undefined && /^\d+$/.test(index)) {
      return {
        label: `Project label ${Number(index) + 1}`,
        selector: `#settings-project-${index}`
      };
    }
    return FIELD_TARGETS.projects;
  }

  if (key === "board.wip_limits") return FIELD_TARGETS["board.wip_limits"];
  if (key.startsWith("board.wip_limits.")) {
    const stage = key.slice("board.wip_limits.".length) as WipStage;
    const label = WIP_LABELS.get(stage) ?? humanizeKey(stage);
    return { label: `${label} work-in-progress limit`, selector: `#board-wip-${stage}` };
  }

  if (key.startsWith("planning.maintainers.")) {
    const [, , index] = key.split(".");
    if (index !== undefined && /^\d+$/.test(index)) {
      return {
        label: "Weekly net hours",
        selector: `#planning-maintainer-hours-${index}`
      };
    }
  }

  return FIELD_TARGETS[key] ?? { label: humanizeKey(key) };
}

function normalizeMessage(issue: SettingsIssue, key: string | undefined): string {
  let text = issue.message.trim();

  if (key) {
    text = text
      .replace(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*`, "i"), "")
      .replace(new RegExp(`^${escapeRegExp(key)}\\s+`, "i"), "");
  }

  text = text
    .replace(/`/g, "")
    .replace(/\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const replacements: [RegExp, string][] = [
    [/must be a number/gi, "must be a whole number"],
    [/must be an integer/gi, "must be a whole number"],
    [/must be >= (-?\d+)/gi, "must be at least $1"],
    [/must be <= (-?\d+)/gi, "must be at most $1"],
    [/must be one of the configured repos/gi, "must be one of the configured repositories"],
    [/must be a boolean/gi, "must be on or off"],
    [
      /must be unique by \(forge, instance, external_id\)/gi,
      "must not list the same person twice"
    ]
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text;
}

function labelMessage(text: string, field: FieldTarget | undefined): string {
  if (!field) return text;
  if (text.length === 0) return field.label;

  const firstWord = field.label.split(" ")[0];
  if (text.toLowerCase().startsWith(firstWord.toLowerCase())) {
    text = `${field.label}${text.slice(firstWord.length)}`;
  } else if (/^[a-z]/.test(text)) {
    text = `${field.label} ${text}`;
  }

  return text;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * Turn raw validator issues into the single, field-labelled sentences shown in
 * the settings alert. Identical sentences are collapsed so one failure is
 * never announced twice.
 */
export function describeSettingsIssues(
  issues: readonly SettingsIssue[],
  idPrefix = "settings-error"
): DescribedSettingsIssue[] {
  const seen = new Set<string>();
  const described: DescribedSettingsIssue[] = [];

  for (const issue of issues) {
    const key = inferKey(issue);
    const field = fieldFor(key);
    const text = sentence(labelMessage(normalizeMessage(issue, key), field));
    if (!text) continue;

    const dedupeKey = text.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    described.push({
      key,
      message: issue.message,
      id: `${idPrefix}-${described.length}`,
      text,
      label: field?.label,
      selector: field?.selector
    });
  }

  return described;
}

/**
 * A fallback sentence for failures that carry no field issues (authentication,
 * malformed payload). The generic save heading is suppressed so it is not
 * repeated, and any remaining dotted keys are removed.
 */
export function settingsSummaryMessage(message: string | undefined): string | null {
  if (!message) return null;
  if (message === SETTINGS_FAILURE_SUMMARY) return null;
  if (message === "Some settings need attention") return null;

  const text = message
    .replace(/^Invalid funnel configuration:\s*/i, "")
    .replace(/`/g, "")
    .replace(/\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b[:\s]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text ? sentence(text) : null;
}
