import { describe, expect, test } from "bun:test";
import { addDaysISO } from "#lib/attention";
import { writeBlocked } from "#lib/funnel-metadata";
import type { UserRef } from "#lib/server/issues/types";
import {
  evaluateAttentionRules,
  type AttentionThresholds,
  type RuleIssue,
  type RuleInput,
} from "./rules";

const DAY_MS = 86_400_000;
// Local noon so the waiting rule's calendar-day comparison is stable.
const NOW = new Date(2026, 10, 5, 12).getTime();
const TODAY_UTC = new Date(NOW).toISOString().slice(0, 10);

const person = (externalId: string, login: string): UserRef => ({
  externalId,
  forge: "github",
  instance: "github.com",
  login,
  avatarUrl: "",
});

const THRESHOLDS: AttentionThresholds = {
  firstResponseDays: 3,
  staleOpenDays: 30,
  recheckCadenceDays: 7,
  waitingDays: 7,
};

function issue(overrides: Partial<RuleIssue> = {}): RuleIssue {
  return {
    repo: "orgA/core",
    number: 7,
    title: "Fix the thing",
    body: "",
    createdAt: NOW,
    updatedAt: NOW,
    blocked: false,
    authorExternalId: "1",
    assignees: [],
    comments: [],
    ...overrides,
  };
}

function evaluate(
  issues: RuleIssue[],
  waiting: RuleInput["waiting"] = [],
  thresholds: Partial<AttentionThresholds> = {},
) {
  return evaluateAttentionRules(
    { issues, waiting },
    { ...THRESHOLDS, ...thresholds },
    NOW,
  );
}

function rules(breaches: ReturnType<typeof evaluate>): string[] {
  return breaches.map((entry) => entry.rule);
}

describe("first response rule", () => {
  test("breaches with no comments exactly at the boundary", () => {
    const breaches = evaluate([issue({ createdAt: NOW - 3 * DAY_MS })]);
    const first = breaches.find((entry) => entry.rule === "first_response");
    expect(first).toMatchObject({
      id: "first_response:orgA/core#7",
      rule: "first_response",
      repo: "orgA/core",
      number: 7,
      daysOverdue: 0,
    });
  });

  test("does not breach just under the boundary", () => {
    expect(
      rules(evaluate([issue({ createdAt: NOW - 3 * DAY_MS + 1 })])),
    ).not.toContain("first_response");
  });

  test("reports whole days overdue just over the boundary", () => {
    const first = evaluate([issue({ createdAt: NOW - 4 * DAY_MS })])
      .find((entry) => entry.rule === "first_response");
    expect(first?.daysOverdue).toBe(1);
  });

  test("an author-only comment still breaches", () => {
    expect(
      rules(
        evaluate([
          issue({
            createdAt: NOW - 4 * DAY_MS,
            comments: [{ authorExternalId: "1" }],
          }),
        ]),
      ),
    ).toContain("first_response");
  });

  test("a comment by someone else clears the breach", () => {
    expect(
      rules(
        evaluate([
          issue({
            createdAt: NOW - 4 * DAY_MS,
            comments: [{ authorExternalId: "2" }],
          }),
        ]),
      ),
    ).not.toContain("first_response");
  });

  test("a null comment author counts as a response", () => {
    expect(
      rules(
        evaluate([
          issue({
            createdAt: NOW - 4 * DAY_MS,
            comments: [{ authorExternalId: null }],
          }),
        ]),
      ),
    ).not.toContain("first_response");
  });

  test("a null issue author means any comment counts", () => {
    const base = { createdAt: NOW - 4 * DAY_MS, authorExternalId: null };
    expect(
      rules(evaluate([issue({ ...base, comments: [{ authorExternalId: "9" }] })])),
    ).not.toContain("first_response");
    expect(rules(evaluate([issue(base)]))).toContain("first_response");
  });

  test("zero disables the rule", () => {
    expect(
      rules(
        evaluate([issue({ createdAt: NOW - 90 * DAY_MS })], [], {
          firstResponseDays: 0,
        }),
      ),
    ).not.toContain("first_response");
  });
});

describe("stale open rule", () => {
  test("breaches exactly at the boundary and reports zero overdue", () => {
    const stale = evaluate([issue({ updatedAt: NOW - 30 * DAY_MS })])
      .find((entry) => entry.rule === "stale_open");
    expect(stale).toMatchObject({ daysOverdue: 0 });
  });

  test("does not breach just under the boundary", () => {
    expect(
      rules(evaluate([issue({ updatedAt: NOW - 30 * DAY_MS + 1 })])),
    ).not.toContain("stale_open");
  });

  test("reports days past the threshold just over the boundary", () => {
    const stale = evaluate([issue({ updatedAt: NOW - 31 * DAY_MS })])
      .find((entry) => entry.rule === "stale_open");
    expect(stale?.daysOverdue).toBe(1);
  });

  test("zero disables the rule", () => {
    expect(
      rules(
        evaluate([issue({ updatedAt: NOW - 90 * DAY_MS })], [], {
          staleOpenDays: 0,
        }),
      ),
    ).not.toContain("stale_open");
  });
});

describe("waiting rule", () => {
  test("exactly seven calendar days is not a breach; eight is", () => {
    const issueRow = issue();
    expect(
      rules(
        evaluate([issueRow], [
          { repo: issueRow.repo, number: issueRow.number, waitingSince: NOW - 7 * DAY_MS },
        ]),
      ),
    ).not.toContain("waiting");
    const breach = evaluate([issueRow], [
      { repo: issueRow.repo, number: issueRow.number, waitingSince: NOW - 8 * DAY_MS },
    ]).find((entry) => entry.rule === "waiting");
    expect(breach?.daysOverdue).toBe(1);
  });

  test("uses the configured threshold", () => {
    expect(
      rules(
        evaluate(
          [issue()],
          [{ repo: "orgA/core", number: 7, waitingSince: NOW - 5 * DAY_MS }],
          { waitingDays: 3 },
        ),
      ),
    ).toContain("waiting");
  });

  test("zero disables the rule", () => {
    expect(
      rules(
        evaluate(
          [issue()],
          [{ repo: "orgA/core", number: 7, waitingSince: NOW - 90 * DAY_MS }],
          { waitingDays: 0 },
        ),
      ),
    ).not.toContain("waiting");
  });

  test("ignores waiting rows whose issue is closed or no longer mirrored", () => {
    expect(
      rules(
        evaluate([], [
          { repo: "orgA/core", number: 7, waitingSince: NOW - 90 * DAY_MS },
        ]),
      ),
    ).toEqual([]);
  });
});

describe("re-check rule", () => {
  const blocked = (recheck: string) =>
    issue({
      blocked: true,
      body: writeBlocked("desc", {
        blocker: "Upstream",
        needs: "Token",
        trying: "",
        recheck,
      }),
    });

  test("exactly the configured days overdue is not a breach; one more is", () => {
    expect(
      rules(evaluate([blocked(addDaysISO(TODAY_UTC, -7))])),
    ).not.toContain("recheck");
    const breach = evaluate([blocked(addDaysISO(TODAY_UTC, -8))])
      .find((entry) => entry.rule === "recheck");
    expect(breach).toMatchObject({ daysOverdue: 1 });
  });

  test("ignores blocked issues with a missing or invalid re-check date", () => {
    expect(rules(evaluate([blocked("")]))).not.toContain("recheck");
    expect(rules(evaluate([blocked("not-a-date")]))).not.toContain("recheck");
    expect(rules(evaluate([blocked("2026-02-30")]))).not.toContain("recheck");
  });

  test("ignores a valid date when the issue is not blocked", () => {
    const row = blocked(addDaysISO(TODAY_UTC, -20));
    expect(rules(evaluate([{ ...row, blocked: false }]))).not.toContain(
      "recheck",
    );
  });

  test("zero disables the rule", () => {
    expect(
      rules(
        evaluate([blocked(addDaysISO(TODAY_UTC, -30))], [], {
          recheckCadenceDays: 0,
        }),
      ),
    ).not.toContain("recheck");
  });
});

describe("rule evaluation shape", () => {
  test("empty input produces no breaches", () => {
    expect(evaluate([], [])).toEqual([]);
  });

  test("keeps assignees and summaries on each breach", () => {
    const ann = person("42", "ann");
    const breach = evaluate([
      issue({ createdAt: NOW - 10 * DAY_MS, assignees: [ann] }),
    ]).find((entry) => entry.rule === "first_response");
    expect(breach?.assignees).toEqual([ann]);
    expect(breach?.summary).toContain("No response");
    expect(breach?.summary).toContain("10 days");
  });

  test("orders by rule, then most overdue, then repo and number", () => {
    const breaches = evaluate([
      issue({ number: 9, createdAt: NOW - 5 * DAY_MS }),
      issue({ number: 3, createdAt: NOW - 8 * DAY_MS }),
      issue({ number: 1, repo: "orgB/web", createdAt: NOW - 8 * DAY_MS }),
    ]);
    expect(breaches.map((entry) => `${entry.rule}:${entry.repo}#${entry.number}`)).toEqual([
      "first_response:orgA/core#3",
      "first_response:orgB/web#1",
      "first_response:orgA/core#9",
    ]);
  });
});
