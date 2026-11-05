import { describe, expect, test } from "bun:test";
import {
  isEditableTarget,
  issueDate,
  issueThreadMarkdown,
  shouldScopeSelectAll,
} from "#lib/issue-copy";
import type { CommentItem, IssueListItem } from "#lib/server/issues/types";

function issue(overrides: Partial<IssueListItem> = {}): IssueListItem {
  return {
    repoId: 1,
    repo: "t128n/funnel",
    number: 50,
    title: "Copy an issue thread",
    state: "open",
    stateReason: null,
    status: "todo",
    priority: "p3",
    impact: null,
    urgency: null,
    size: "md",
    issueType: null,
    blocked: false,
    labelConflict: false,
    createdAt: Date.parse("2026-10-19T09:00:00Z"),
    updatedAt: Date.parse("2026-10-19T09:00:00Z"),
    closedAt: null,
    author: { externalId: "1", forge: "github", instance: "github.com", login: "t128n", avatarUrl: "" },
    assignees: [],
    milestone: null,
    labels: [],
    ...overrides,
  };
}

function comment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    externalId: "7",
    author: { externalId: "2", forge: "github", instance: "github.com", login: "octocat", avatarUrl: "" },
    body: "Looks good.",
    createdAt: Date.parse("2026-10-19T10:00:00Z"),
    ...overrides,
  };
}

const URL = "https://github.com/t128n/funnel/issues/50";

describe("issueThreadMarkdown", () => {
  test("builds title, byline, body, then each comment", () => {
    expect(
      issueThreadMarkdown({
        url: URL,
        issue: issue(),
        body: "The description.",
        comments: [comment()],
      }),
    ).toBe(
      [
        "# Copy an issue thread",
        "",
        `[t128n/funnel#50](${URL}) · opened by @t128n on 2026-10-19`,
        "",
        "The description.",
        "",
        "---",
        "",
        "@octocat commented on 2026-10-19:",
        "",
        "Looks good.",
        "",
      ].join("\n"),
    );
  });

  test("keeps comment Markdown verbatim and separates the thread", () => {
    const text = issueThreadMarkdown({
      url: URL,
      issue: issue(),
      body: "Body",
      comments: [comment({ body: "**Bold**\n\n- one\n- two" })],
    });
    expect(text).toContain("**Bold**\n\n- one\n- two");
    expect(text).toContain("\n\n---\n\n@octocat commented");
  });

  test("strips the trailing funnel_metadata envelope from the body", () => {
    const text = issueThreadMarkdown({
      url: URL,
      issue: issue(),
      body: "Visible prose.\n\n<!-- funnel_metadata\nblocked: true\n-->",
      comments: [],
    });
    expect(text).toContain("Visible prose.");
    expect(text).not.toContain("funnel_metadata");
    expect(text).not.toContain("blocked: true");
  });

  test("omits the body block without leaving a stray separator", () => {
    const text = issueThreadMarkdown({ url: URL, issue: issue(), body: "   ", comments: [] });
    expect(text).toBe(
      [
        "# Copy an issue thread",
        "",
        `[t128n/funnel#50](${URL}) · opened by @t128n on 2026-10-19`,
        "",
      ].join("\n"),
    );
  });

  test("omits empty comments instead of emitting an empty quote", () => {
    const text = issueThreadMarkdown({
      url: URL,
      issue: issue(),
      body: "Body",
      comments: [comment({ body: "\n" }), comment({ externalId: "8", body: "Kept." })],
    });
    expect(text).toContain("Kept.");
    expect(text.match(/commented on/g)).toHaveLength(1);
  });

  test("orders comments chronologically", () => {
    const text = issueThreadMarkdown({
      url: URL,
      issue: issue(),
      body: "Body",
      comments: [
        comment({ externalId: "2", body: "Second.", createdAt: Date.parse("2026-10-20T10:00:00Z") }),
        comment({ externalId: "1", body: "First.", createdAt: Date.parse("2026-10-18T10:00:00Z") }),
      ],
    });
    expect(text.indexOf("First.")).toBeLessThan(text.indexOf("Second."));
  });

  test("falls back to @ghost for deleted authors", () => {
    const text = issueThreadMarkdown({
      url: URL,
      issue: issue({ author: null }),
      body: "Body",
      comments: [comment({ author: null })],
    });
    expect(text).toContain("opened by @ghost on");
    expect(text).toContain("@ghost commented on");
  });
});

describe("issueDate", () => {
  test("renders a locale-independent UTC date", () => {
    expect(issueDate(Date.parse("2026-10-19T23:30:00Z"))).toBe("2026-10-19");
  });
});

describe("isEditableTarget", () => {
  test("claims the fields that own Mod+A", () => {
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(
      isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
  });

  test("leaves ordinary content and non-elements alone", () => {
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(
      false,
    );
    expect(isEditableTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false);
  });
});

describe("shouldScopeSelectAll", () => {
  const div = { tagName: "DIV" } as unknown as EventTarget;

  test("claims Mod+A on content, on both platforms", () => {
    expect(shouldScopeSelectAll({ key: "a", ctrlKey: true, target: div })).toBe(true);
    expect(shouldScopeSelectAll({ key: "a", metaKey: true, target: div })).toBe(true);
    expect(shouldScopeSelectAll({ key: "A", ctrlKey: true, target: div })).toBe(true);
  });

  test("leaves fields their native select-all", () => {
    expect(
      shouldScopeSelectAll({ key: "a", ctrlKey: true, target: { tagName: "TEXTAREA" } as unknown as EventTarget }),
    ).toBe(false);
    expect(
      shouldScopeSelectAll({ key: "a", metaKey: true, target: { tagName: "INPUT" } as unknown as EventTarget }),
    ).toBe(false);
    expect(
      shouldScopeSelectAll({
        key: "a",
        ctrlKey: true,
        target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget,
      }),
    ).toBe(false);
  });

  test("ignores plain and other-chord keys", () => {
    expect(shouldScopeSelectAll({ key: "a", target: div })).toBe(false);
    expect(shouldScopeSelectAll({ key: "c", ctrlKey: true, target: div })).toBe(false);
    expect(shouldScopeSelectAll({ key: "a", ctrlKey: true, altKey: true, target: div })).toBe(false);
  });
});
