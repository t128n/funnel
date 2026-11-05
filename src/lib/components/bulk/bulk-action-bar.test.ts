import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

/**
 * `BulkActionBar.svelte` is wiring, not a pure function. Bun has no Svelte
 * loader, so assert its contracts from the source, like the table tests.
 */
const source = readFileSync(new URL("./BulkActionBar.svelte", import.meta.url), "utf8");
const appLayout = readFileSync(
  new URL("../../../routes/(app)/+layout.svelte", import.meta.url),
  "utf8",
);
const inboxPage = readFileSync(
  new URL("../../../routes/(app)/inbox/+page.svelte", import.meta.url),
  "utf8",
);
const issuesPage = readFileSync(
  new URL("../../../routes/(app)/issues/+page.svelte", import.meta.url),
  "utf8",
);

describe("BulkActionBar execution", () => {
  test("uses the bounded runner instead of unbounded Promise.all", () => {
    expect(source).toContain("runBulk(tasks, { concurrency: 3 })");
    expect(source).toContain("import { runBulk, type BulkTask }");
  });

  test("keeps successful keys and leaves failed rows selected", () => {
    expect(source).toContain("bulkSelection.removeMany(result.succeeded");
    expect(source).toContain("Successful writes were kept.");
    expect(source).toContain("keyLabel(row.key)");
  });

  test("only removes targeted successful rows, never the whole selection", () => {
    expect(source).toContain("bulkSelection.removeMany(");
    expect(source).toContain("onclick={clear}");
  });
});

describe("BulkActionBar actions", () => {
  test("issues offer status, impact, urgency, size, assignee and labels", () => {
    for (const control of [
      'aria-label="Set status for selected issues"',
      'aria-label="Set impact for selected issues"',
      'aria-label="Set urgency for selected issues"',
      'aria-label="Set size for selected issues"',
      'ariaLabel="Choose assignees for selected issues"',
      'ariaLabel="Choose labels to add to selected issues"',
    ]) {
      expect(source).toContain(control);
    }
    expect(source).toContain("addIssueLabels(ref.repo, ref.number, chosen)");
    expect(source).toContain("updateIssue(ref.repo, ref.number, patch)");
  });

  test("submission dismiss requires a reason and the bulk snooze covers both kinds", () => {
    expect(source).toContain("dismissSubmission(id, reason)");
    expect(source).toContain("dismissReason.trim().length === 0");
    expect(source).toContain("kind: 'issue', repo: ref.repo, number: ref.number");
    expect(source).toContain("kind: 'submission', id");
  });
});

describe("BulkActionBar gating", () => {
  test("renders only for writers with a selection", () => {
    expect(source).toContain("{#if mayWrite && count > 0}");
  });

  test("issues and inbox pages pass the writer role and option lists", () => {
    expect(issuesPage).toContain("canWrite(data.user?.role)");
    expect(issuesPage).toContain("assignees={bulkAssignees}");
    expect(issuesPage).toContain("labels={bulkLabels}");
    expect(inboxPage).toContain("canWrite(data.user?.role)");
    expect(inboxPage).toContain("assignees={bulkAssignees}");
    expect(inboxPage).toContain("labels={bulkLabels}");
  });

  test("navigation clears selection while feed refreshes do not", () => {
    expect(appLayout).toContain("afterNavigate(({ from }) =>");
    expect(appLayout).toContain("clearBulkSelection()");
    expect(appLayout).not.toContain("bulkSelection.clear()");
  });

  test("mixed inbox groups label and disable the absent kind", () => {
    expect(source).toContain("kind === 'inbox'");
    expect(source).toContain("Issues {issueCount}");
    expect(source).toContain("Submissions {submissionCount}");
    expect(source).toContain("disabled={running || !hasIssues}");
    expect(source).toContain("disabled={running || !hasSubmissions}");
  });
});
