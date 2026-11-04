import { describe, expect, test } from "bun:test";
import {
  describeSettingsIssues,
  SETTINGS_FAILURE_SUMMARY,
  settingsSummaryMessage,
} from "./settings-feedback";

describe("describeSettingsIssues", () => {
  test("maps a dotted key to the visible field label", () => {
    const [issue] = describeSettingsIssues([
      { key: "session.idle_days", message: "session.idle_days must be a number" },
    ]);

    expect(issue.text).toBe("Idle lifetime must be a whole number.");
    expect(issue.selector).toBe("#session-idle-days");
    expect(issue.text).not.toContain("session.idle_days");
  });

  test("maps array paths to the matching repository row", () => {
    const [issue] = describeSettingsIssues([
      { key: "repos.2", message: "Repository must be in `owner/name` form" },
    ]);

    expect(issue.text).toBe("Repository 3 must be in owner/name form.");
    expect(issue.selector).toBe("#settings-repo-2");
  });

  test("infers a field from a cross-field configuration message", () => {
    const [issue] = describeSettingsIssues([
      { message: "intake.default_repo must be one of the configured repos" },
    ]);

    expect(issue.key).toBe("intake.default_repo");
    expect(issue.selector).toBe("#intake-default-repo");
    expect(issue.text).toBe("Default repository must be one of the configured repositories.");
    expect(issue.text).not.toMatch(/intake\.default_repo/);
  });

  test("labels a per-stage work-in-progress failure", () => {
    const [issue] = describeSettingsIssues([
      { key: "board.wip_limits.todo", message: "board.wip_limits must be a number" },
    ]);

    expect(issue.text).toBe("Todo work-in-progress limit must be a whole number.");
    expect(issue.selector).toBe("#board-wip-todo");
  });

  test("deduplicates the same sentence and never exposes a dotted key", () => {
    const issues = describeSettingsIssues([
      { key: "sync.history_days", message: "sync.history_days must be a number" },
      { key: "sync.history_days", message: "sync.history_days must be a number" },
      { key: "planning.allocation_percent", message: "planning.allocation_percent must be <= 100" },
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.text)).toEqual([
      "History window must be a whole number.",
      "Allocation must be at most 100.",
    ]);
    for (const issue of issues) expect(issue.text).not.toMatch(/[a-z_]+\.[a-z_]+/);
  });

  test("uses a unique error id per sentence", () => {
    const issues = describeSettingsIssues(
      [
        { key: "session.idle_days", message: "session.idle_days must be a number" },
        { key: "sync.history_days", message: "sync.history_days must be a whole number" },
      ],
      "form-7"
    );

    expect(issues.map((issue) => issue.id)).toEqual(["form-7-0", "form-7-1"]);
  });
});

describe("settingsSummaryMessage", () => {
  test("suppresses the duplicate generic heading", () => {
    expect(settingsSummaryMessage(SETTINGS_FAILURE_SUMMARY)).toBeNull();
    expect(settingsSummaryMessage("Some settings need attention")).toBeNull();
  });

  test("keeps a real fallback error and strips internal keys", () => {
    expect(settingsSummaryMessage("Malformed settings payload")).toBe(
      "Malformed settings payload."
    );
    expect(
      settingsSummaryMessage(
        "Invalid funnel configuration: session.idle_days must be a number; sync.history_days must be a number"
      )
    ).not.toMatch(/session\.idle_days|sync\.history_days/);
  });
});
