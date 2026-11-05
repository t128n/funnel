import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateSnooze,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { createSubmission, listSubmissions } from "#lib/server/intake/staging";
import {
  allIssues,
  clearQueryCaches,
  getIssueListItem,
  inbox,
  inboxCount,
  snoozedInbox,
} from "#lib/server/issues/queries";
import { EMPTY_FILTER } from "#lib/server/issues/filters";
import {
  clearIssueSnooze,
  clearSubmissionSnooze,
  isIssueSnoozed,
  isSubmissionSnoozed,
  issueSnoozeKey,
  listSnoozed,
  MAX_SNOOZE_HORIZON_MS,
  snoozeIssue,
  snoozeSubmission,
  submissionSnoozeKey,
  validateSnoozeUntil,
} from "#lib/server/snooze";
import {
  deleteIssue,
  upsertIssue,
  upsertRepo,
  type IssueRecord,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

const NOW = 1_800_000_000_000;
const LATER = NOW + 60_000;

function seedRepo(): number {
  return upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
}

function seedIssue(
  repoId: number,
  number: number,
  status: string | null,
): void {
  const record: IssueRecord = {
    externalId: String(100 + number),
    repoId,
    number,
    kind: "issue",
    title: `Issue ${number}`,
    body: "",
    state: "open",
    stateReason: null,
    author: null,
    milestoneNumber: null,
    url: `https://github.com/orgA/core/issues/${number}`,
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: [],
  };
  upsertIssue(record, {
    status,
    impact: null,
    urgency: null,
    priority: status ? "P2" : null,
    size: null,
    blocked: false,
    labelConflict: false,
  });
}

beforeEach(() => {
  setConfig(TEST_CONFIG);
  db.delete(stateSnooze).run();
  db.delete(stateIntakeSubmission).run();
  db.delete(stateTriageEvent).run();
  clearMirror();
});

afterEach(() => {
  db.delete(stateSnooze).run();
});

describe("snooze validation", () => {
  test("accepts only a future time inside the one-year horizon", () => {
    expect(validateSnoozeUntil(LATER, NOW)).toEqual({ ok: true, value: LATER });
    expect(validateSnoozeUntil(NOW, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(validateSnoozeUntil(NOW - 1, NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(validateSnoozeUntil(1.5, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(
      validateSnoozeUntil(NOW + MAX_SNOOZE_HORIZON_MS + 1, NOW),
    ).toMatchObject({ ok: false, status: 400 });
  });

  test("rejects malformed targets", () => {
    expect(snoozeSubmission("", LATER, null, NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(snoozeIssue("not-a-slug", 1, LATER, null, NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(snoozeIssue("orgA/core", 0, LATER, null, NOW)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("submission snoozes", () => {
  test("hide a submission, exclude it from counts, and resurface when due", () => {
    const { id } = createSubmission({ title: "Defer me" });

    const result = snoozeSubmission(id, LATER, "actor", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      key: submissionSnoozeKey(id),
      submissionId: id,
      snoozedUntil: LATER,
      actorUserId: "actor",
    });

    expect(isSubmissionSnoozed(id, NOW)).toBe(true);
    expect(listSubmissions(NOW)).toEqual([]);
    expect(listSnoozed(NOW).map((row) => row.key)).toContain(
      submissionSnoozeKey(id),
    );

    // Due exactly at the resurface time (strictly greater than now).
    expect(isSubmissionSnoozed(id, LATER)).toBe(false);
    expect(listSubmissions(LATER).map((row) => row.id)).toEqual([id]);
  });

  test("clears the snooze without touching the submission", () => {
    const { id } = createSubmission({ title: "Clear me" });
    snoozeSubmission(id, LATER, null, NOW);
    expect(clearSubmissionSnooze(id)).toBe(true);
    expect(clearSubmissionSnooze(id)).toBe(false);
    expect(isSubmissionSnoozed(id, NOW)).toBe(false);
    expect(listSubmissions(NOW).map((row) => row.id)).toEqual([id]);
  });
});

describe("issue snoozes", () => {
  test("hide an untriaged issue from the Inbox and count, but not from All Issues", () => {
    const repoId = seedRepo();
    seedIssue(repoId, 2, null);
    seedIssue(repoId, 3, "todo");

    expect(inboxNumbers(NOW)).toEqual([2]);
    expect(inboxCount(EMPTY_FILTER, NOW)).toBe(1);

    const result = snoozeIssue("orgA/core", 2, LATER, "actor", NOW);
    expect(result.ok).toBe(true);
    expect(isIssueSnoozed("orgA/core", 2, NOW)).toBe(true);
    clearQueryCaches();

    expect(inboxNumbers(NOW)).toEqual([]);
    expect(inboxCount(EMPTY_FILTER, NOW)).toBe(0);
    // The mirror row is untouched, so every other view still sees it.
    expect(getIssueListItem(repoId, 2)).toBeDefined();

    // A snoozed triaged issue is outside the Inbox anyway and stays listed.
    snoozeIssue("orgA/core", 3, LATER, null, NOW);
    clearQueryCaches();
    expect(allIssues(EMPTY_FILTER).items.map((issue) => issue.number)).toEqual([
      3,
    ]);

    // Due: the untriaged issue returns automatically at the resurface time.
    clearQueryCaches();
    expect(inboxNumbers(LATER)).toEqual([2]);
    expect(inboxCount(EMPTY_FILTER, LATER)).toBe(1);
  });

  test("survive mirror pruning and a re-sync without losing their identity", () => {
    const repoId = seedRepo();
    seedIssue(repoId, 2, null);
    snoozeIssue("orgA/core", 2, LATER, null, NOW);

    // Simulate a prune/re-sync: delete the disposable mirror row.
    deleteIssue(repoId, 2);    expect(getIssueListItem(repoId, 2)).toBeUndefined();
    expect(isIssueSnoozed("orgA/core", 2, NOW)).toBe(true);

    const pruned = snoozedInbox(NOW).find(
      (item) => item.key === issueSnoozeKey("orgA/core", 2),
    );
    expect(pruned).toMatchObject({
      kind: "issue",
      repo: "orgA/core",
      number: 2,
      title: "orgA/core#2",
      available: false,
    });

    // Re-sync re-adds the issue; the snooze still applies.
    seedIssue(repoId, 2, null);
    clearQueryCaches();
    expect(
      snoozedInbox(NOW).find((item) => item.key === issueSnoozeKey("orgA/core", 2))
        ?.available,
    ).toBe(true);
    expect(inboxNumbers(NOW)).toEqual([]);
  });

  test("clears an issue snooze", () => {
    seedRepo();
    snoozeIssue("orgA/core", 2, LATER, null, NOW);
    expect(clearIssueSnooze("orgA/core", 2)).toBe(true);
    expect(clearIssueSnooze("orgA/core", 2)).toBe(false);
    expect(isIssueSnoozed("orgA/core", 2, NOW)).toBe(false);
  });

  test("the Snoozed view lists submissions and issues with their due date", () => {
    const { id } = createSubmission({ title: "Deferred request" });
    snoozeSubmission(id, LATER, null, NOW);
    seedRepo();
    seedIssue(1, 2, null);
    snoozeIssue("orgA/core", 2, LATER + 1000, null, NOW);

    const items = snoozedInbox(NOW);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "submission",
      submissionId: id,
      title: "Deferred request",
      snoozedUntil: LATER,
    });
    expect(items[1]).toMatchObject({
      kind: "issue",
      repo: "orgA/core",
      number: 2,
      title: "Issue 2",
      snoozedUntil: LATER + 1000,
    });
  });
});

/** The Inbox's untriaged issue numbers at a fixed clock. */
function inboxNumbers(now: number): number[] {
  return inbox(EMPTY_FILTER, {}, now).items
    .filter((entry) => entry.kind === "issue")
    .map((entry) => entry.issue.number);
}
