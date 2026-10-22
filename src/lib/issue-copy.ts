/**
 * Pure builders for copying an issue thread out of Funnel.
 *
 * Two paths copy a thread, and they deliberately differ:
 * - the Inspector header's button calls {@link issueThreadMarkdown}, which
 *   emits self-contained Markdown: title, byline, body, then each comment;
 * - Mod+A selects the rendered thread in the DOM and lets the browser copy
 *   what the reader sees, which is a transcript rather than Markdown.
 *
 * Both paths share the rules below: the trailing `<!-- funnel_metadata … -->`
 * envelope never leaves Funnel (it is bookkeeping, not issue prose), internal
 * work notes are never included, and empty prose leaves no stray heading or
 * separator behind.
 *
 * The module stays free of DOM and `window` so it can be exercised in tests.
 */
import { splitFunnelMetadata } from "#lib/funnel-metadata";
import type { CommentItem, IssueListItem } from "#lib/server/issues/types";

export interface IssueThreadInput {
  /** Canonical GitHub URL for the issue. */
  url: string;
  issue: IssueListItem;
  /** Raw Markdown body; the metadata envelope is stripped. */
  body: string;
  /** Raw Markdown comments; sorted chronologically and empty ones skipped. */
  comments: CommentItem[];
}

/** GitHub renders a deleted account's comments as `ghost`; so do we. */
const GHOST = "ghost";

/** `YYYY-MM-DD` in UTC, independent of the viewer's locale. */
export function issueDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function mention(login: string | null | undefined): string {
  return `@${login ?? GHOST}`;
}

/**
 * The whole thread as one Markdown document: title, byline, body, then each
 * comment with its author and date. Empty prose leaves no stray heading or
 * separator behind.
 */
export function issueThreadMarkdown(input: IssueThreadInput): string {
  const { url, issue, comments } = input;
  const body = splitFunnelMetadata(input.body).content.trim();

  const parts = [
    `# ${issue.title.trim()}`,
    "",
    `[${issue.repo}#${issue.number}](${url}) · opened by ${mention(
      issue.author?.login,
    )} on ${issueDate(issue.createdAt)}`,
  ];

  if (body.length > 0) parts.push("", body);

  const ordered = comments.slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const comment of ordered) {
    const text = comment.body.trim();
    if (text.length === 0) continue;
    parts.push(
      "",
      "---",
      "",
      `${mention(comment.author?.login)} commented on ${issueDate(comment.createdAt)}:`,
      "",
      text,
    );
  }

  return `${parts.join("\n")}\n`;
}

/** Tags that own their own select-all. */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether a keyboard target belongs to a field that handles Mod+A itself. The
 * Inspector only re-scopes select-all for content that is not being edited.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (typeof element.tagName === "string" && EDITABLE_TAGS.has(element.tagName.toUpperCase())) {
    return true;
  }
  return element.isContentEditable === true;
}

/** The parts of a keydown that decide whether the pane re-scopes Mod+A. */
export interface SelectAllChord {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target: EventTarget | null;
}

/**
 * Whether the Inspector should take over Mod+A. Fields keep their own
 * select-all, and plain `a` or other modifier chords belong to the browser.
 */
export function shouldScopeSelectAll(chord: SelectAllChord): boolean {
  if (chord.key.toLowerCase() !== "a") return false;
  if (!(chord.metaKey || chord.ctrlKey)) return false;
  if (chord.altKey) return false;
  return !isEditableTarget(chord.target);
}
