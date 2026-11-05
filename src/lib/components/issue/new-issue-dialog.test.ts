import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Source contracts for the in-app quick-create dialog (issue #18). The dialog
 * itself is a Svelte component; Bun cannot mount it without the compiler, so
 * this suite guards the required fields, wiring, and access gates.
 */
const root = new URL("../../../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

const dialog = source("lib/components/issue/NewIssueDialog.svelte");
const layout = source("routes/(app)/+layout.svelte");
const column = source("lib/components/board/BoardColumn.svelte");
const board = source("lib/components/board/StatusBoard.svelte");
const store = source("lib/client/quick-create.ts");

describe("new issue dialog fields", () => {
  test("collects every field the create API accepts", () => {
    for (const id of [
      "new-issue-repo",
      "new-issue-field-title",
      "new-issue-body",
      "new-issue-status",
      "new-issue-impact",
      "new-issue-urgency",
      "new-issue-size",
      "new-issue-assignees",
      "new-issue-labels",
    ]) {
      expect(dialog).toContain(`id="${id}"`);
    }
  });

  test("associates a visible label with each field", () => {
    for (const id of [
      "new-issue-repo",
      "new-issue-field-title",
      "new-issue-body",
      "new-issue-status",
      "new-issue-impact",
      "new-issue-urgency",
      "new-issue-size",
      "new-issue-assignees",
      "new-issue-labels",
    ]) {
      expect(dialog).toContain(`for="${id}"`);
    }
  });

  test("uses the logical status, size, priority and label values", () => {
    expect(dialog).toContain("STATUS_OPTIONS");
    expect(dialog).toContain("SIZE_OPTIONS");
    expect(dialog).toContain("IMPACT_SCALE");
    expect(dialog).toContain("URGENCY_SCALE");
    expect(dialog).toContain("labelOptions");
    // Reserved group labels come from their own fields, not this picker.
    expect(dialog).toContain("Reserved status, impact, urgency, size and flag labels");
  });

  test("offers the repo's issue types only when the host supports them", () => {
    expect(dialog).toContain("fetchIssueTypes");
    expect(dialog).toContain("issueTypes.length > 0");
    expect(dialog).toContain('id="new-issue-type"');
    expect(dialog).toContain('for="new-issue-type"');
    expect(dialog).toContain("issueType = ''");
    expect(dialog).toContain("...(issueType ? { issueType } : {})");
  });

  test("creates through the existing helper and refreshes the feeds", () => {
    expect(dialog).toContain("createIssue(");
    expect(dialog).toContain("invalidateAll()");
    expect(dialog).toContain("reportQuickCreateSuccess");
    expect(dialog).toContain("htmlUrl");
  });

  test("keeps a failed create open with a visible error", () => {
    expect(dialog).toContain("if (!result.ok)");
    expect(dialog).toContain('InlineStatus tone="error"');
  });

  test("does not repurpose the external intake flow", () => {
    expect(dialog).toContain('href="/intake"');
    expect(dialog).not.toContain("goto('/intake')");
  });
});

describe("quick-create entry points", () => {
  test("C opens the dialog instead of navigating to /intake", () => {
    expect(layout).toContain("openQuickCreate()");
    expect(layout).toContain("'issue.create'");
    expect(layout).not.toContain("goto('/intake')");
  });

  test("the global dialog is wired to the layout data", () => {
    expect(layout).toContain("<NewIssueDialog");
    expect(layout).toContain("repos={repoChoices}");
    expect(layout).toContain("defaultRepo={data.defaultRepo}");
    expect(layout).toContain("assignees={data.options.assignees}");
    expect(layout).toContain("labelOptions={data.options.labels}");
  });

  test("the confirmation shows the GitHub link", () => {
    expect(layout).toContain("$quickCreate.success");
    expect(layout).toContain("success.htmlUrl");
    expect(layout).toContain("Open on GitHub");
  });

  test("a board column opens it with that column's status", () => {
    expect(board).toContain("openQuickCreate({ status: column.key })");
    expect(column).toContain("onNewIssue");
    expect(column).not.toContain('href="/intake"');
  });

  test("Done never becomes a status prefill", () => {
    expect(store).toContain("OPEN_STATUSES.has(status)");
    expect(store).toContain("const status = prefill.status?.trim()");
  });
});

describe("read-only gating", () => {
  test("the hotkey is registered only for writers", () => {
    expect(layout).toContain("...(mayWrite");
    expect(layout).toContain("canWrite(data.user.role)");
  });

  test("the dialog is mounted only for writers", () => {
    expect(layout).toMatch(/\{#if mayWrite\}[\s\S]*<NewIssueDialog/);
  });

  test("the board control is hidden from readers", () => {
    expect(column).toContain("{#if !readonly}");
    expect(board).toContain("if (!readonly) openQuickCreate");
  });
});
