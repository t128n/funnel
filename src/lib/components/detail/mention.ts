/**
 * Pure helpers behind the composer's `@login` autocomplete.
 *
 * Keeping the caret arithmetic out of the component makes the awkward cases
 * testable: an empty query right after `@`, a partial login in the middle of a
 * sentence, an email address that must not trigger the menu, and replacing a
 * partially typed login without leaving its suffix behind.
 */

/** Characters GitHub allows in a login (and that we consume while typing). */
const LOGIN_CHAR = /[A-Za-z0-9-]/;

/** Punctuation that may immediately precede a mention. */
const BOUNDARY = /[\s([{<"'`~!@#$%^&*+=|\\:;,?]/;

export interface ActiveMention {
  /** Index of the `@`. */
  start: number;
  /** Text typed after the `@`, up to the caret. */
  query: string;
}

export interface MentionCandidate {
  login: string;
}

/**
 * The mention being typed at `caret`, or `null` when the caret is not in one.
 * `foo@bar` (an email) does not qualify because the character before `@` is
 * not a boundary.
 */
export function activeMentionAt(
  value: string,
  caret: number,
): ActiveMention | null {
  const end = Math.max(0, Math.min(caret, value.length));
  let index = end;
  while (index > 0 && LOGIN_CHAR.test(value[index - 1] ?? "")) index -= 1;
  if (index === 0 || value[index - 1] !== "@") return null;

  const start = index - 1;
  const before = start === 0 ? "" : (value[start - 1] ?? "");
  if (before.length > 0 && !BOUNDARY.test(before)) return null;

  const query = value.slice(index, end);
  // A pasted URL or an unusually long token is not a login.
  if (query.length > 64) return null;
  return { start, query };
}

/** Candidates whose login starts with the typed query, alphabetically. */
export function filterMentions<T extends MentionCandidate>(
  options: readonly T[],
  query: string,
  limit = 6,
): T[] {
  const needle = query.toLowerCase();
  return options
    .filter((option) => option.login.toLowerCase().startsWith(needle))
    .sort(
      (a, b) =>
        a.login.toLowerCase().localeCompare(b.login.toLowerCase()) ||
        a.login.localeCompare(b.login),
    )
    .slice(0, Math.max(1, limit));
}

/**
 * Replace the typed mention with `@login` plus a trailing space. A partial
 * login after the caret is consumed too, so accepting `@al` in `@alice` does
 * not produce `@aliceice`.
 */
export function applyMention(
  value: string,
  caret: number,
  mention: ActiveMention,
  login: string,
): { value: string; caret: number } {
  const end = Math.max(caret, mention.start + 1);
  let wordEnd = Math.max(0, Math.min(end, value.length));
  while (
    wordEnd < value.length &&
    LOGIN_CHAR.test(value[wordEnd] ?? "")
  ) {
    wordEnd += 1;
  }
  const next = value[wordEnd] ?? "";
  const suffix = next.length > 0 && /\s/.test(next) ? "" : " ";
  const inserted = `@${login}${suffix}`;
  return {
    value: `${value.slice(0, mention.start)}${inserted}${value.slice(wordEnd)}`,
    caret: mention.start + inserted.length,
  };
}
