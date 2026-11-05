/**
 * Search-query parsing for the issue streams (SPEC §9.4).
 *
 * The URL keeps one `q` parameter. Its value mixes free text, issue
 * identifiers (`#123`, `FIT-123`, `owner/repo#123`) and GitHub-style
 * qualifiers (`is:`, `label:`, `repo:`, `status:`, `assignee:`). This module
 * turns that string into a structured {@link SearchQuery} using the same
 * {@link SearchContext} the URL filter parser receives, so identifier and
 * qualifier resolution stay case-insensitive and mirror-aware.
 *
 * The parser is pure: it never touches the database. Free text is handed to
 * {@link ftsMatchExpression}, which quotes every term for FTS5 so user input
 * can never be interpreted as an operator or throw a syntax error.
 */
import { deriveRepoShortcode } from "#lib/issue-ref";

/** The subset of request context search resolution needs. */
export interface SearchContext {
  /** Every mirrored repo, for `owner/name` and shortcode resolution. */
  repos: ReadonlyArray<{ id: number; org: string; name: string }>;
  /** `owner/name` → configured shortcode (settings). Keys are matched case-insensitively. */
  shortcodes?: Readonly<Record<string, string>>;
  /** The signed-in viewer's forge-native id (`assignee:me`). */
  viewerExternalId?: string | null;
  /** Login → external id resolver (case-insensitive) for assignee names. */
  resolveLogin?: (login: string) => string | undefined;
}

/** One resolved issue reference. `repoId: null` means "any repository". */
export interface SearchIdentifier {
  repoId: number | null;
  number: number;
}

/**
 * Parsed search constraints. Identifiers, repositories, statuses and
 * assignees OR within their token group; every group (and every label
 * qualifier) ANDs with the URL dimensions and with free text.
 */
export interface SearchQuery {
  /** Free text for FTS; qualifier and identifier tokens are removed. */
  text: string;
  /** Issue references to match (OR). */
  identifiers: SearchIdentifier[];
  /** Labels that must all be present (AND across tokens). */
  labels: string[];
  /** Repositories to match (OR). */
  repos: number[];
  /** Statuses to match (OR). */
  statuses: string[];
  /** Assignee external ids to match (OR). */
  assignees: string[];
  /** Require an issue with no assignee at all. */
  unassigned: boolean;
  /** Require the blocked flag to equal this value; `null` means any. */
  blocked: boolean | null;
  /** A token named something that can never match (unknown repo, bad value). */
  impossible: boolean;
}

/** An empty query: no text, no identifiers, no qualifiers. */
export function emptySearchQuery(): SearchQuery {
  return {
    text: "",
    identifiers: [],
    labels: [],
    repos: [],
    statuses: [],
    assignees: [],
    unassigned: false,
    blocked: null,
    impossible: false,
  };
}

/** Canonical status names accepted by `status:` (kept in step with filters). */
const SEARCH_STATUSES = new Set([
  "backlog",
  "todo",
  "in-progress",
  "in-review",
  "none",
]);

const NONE = "none";

/** `owner/name#123` or `#123`; the repository prefix is optional. */
const ISSUE_HASH = /^(?:([^#\s/]+\/[^#\s/]+))?#(\d+)$/;
/** `FIT-123`; resolved only when the shortcode belongs to a mirrored repo. */
const SHORTCODE_REF = /^([A-Za-z][A-Za-z0-9]{0,5})-(\d+)$/;
/** `key:value`, with the key restricted to qualifier-shaped names. */
const QUALIFIER = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/;

/** Split on whitespace while keeping a double-quoted value together. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of input) {
    if (quoted) {
      if (char === '"') quoted = false;
      else current += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/** Resolve `owner/name` (case-insensitive) to a mirrored repo id. */
function repoIdForSlug(
  slug: string,
  repos: SearchContext["repos"],
): number | undefined {
  const slash = slug.indexOf("/");
  if (slash <= 0 || slash === slug.length - 1) return undefined;
  const org = slug.slice(0, slash).toLowerCase();
  const name = slug.slice(slash + 1).toLowerCase();
  return repos.find(
    (repo) => repo.org.toLowerCase() === org && repo.name.toLowerCase() === name,
  )?.id;
}

/** Configured shortcode for a repo, falling back to the shared derivation. */
function shortcodeFor(repo: { org: string; name: string }, ctx: SearchContext): string {
  const slug = `${repo.org}/${repo.name}`;
  const configured =
    ctx.shortcodes?.[slug] ??
    Object.entries(ctx.shortcodes ?? {}).find(
      ([key]) => key.toLowerCase() === slug.toLowerCase(),
    )?.[1];
  return (configured ?? deriveRepoShortcode(slug)).toUpperCase();
}

/** Resolve a project shortcode (case-insensitive) to a mirrored repo id. */
function repoIdForShortcode(
  shortcode: string,
  ctx: SearchContext,
): number | undefined {
  const wanted = shortcode.toUpperCase();
  for (const repo of ctx.repos) {
    if (shortcodeFor(repo, ctx) === wanted) return repo.id;
  }
  return undefined;
}

/** Resolve `assignee:` the same way the URL dimension does. */
function resolveAssignee(
  value: string,
  ctx: SearchContext,
): { id?: string; unassigned?: boolean; impossible?: boolean } {
  const lower = value.toLowerCase();
  if (lower === NONE) return { unassigned: true };
  if (lower === "me") {
    return ctx.viewerExternalId
      ? { id: ctx.viewerExternalId }
      : { impossible: true };
  }
  if (/^\d+$/.test(value)) return { id: value };
  const id = ctx.resolveLogin?.(value);
  return id ? { id } : { impossible: true };
}

/**
 * Parse the `q` value into text, identifiers and qualifier constraints.
 * Unknown `key:value` tokens stay in the free text (so URLs and prose are not
 * silently swallowed), while a known qualifier with an unresolvable value
 * marks the query impossible rather than broadening it.
 */
export function parseSearchQuery(raw: string, ctx: SearchContext): SearchQuery {
  const query = emptySearchQuery();
  const text: string[] = [];

  const fail = (): void => {
    query.impossible = true;
  };

  for (const token of tokenize(raw)) {
    const qualifier = QUALIFIER.exec(token);
    if (qualifier) {
      const key = qualifier[1].toLowerCase();
      const value = qualifier[2].trim();
      if (key === "is") {
        switch (value.toLowerCase()) {
          case "unassigned":
            query.unassigned = true;
            continue;
          case "blocked":
            query.blocked = true;
            continue;
          case "unblocked":
            query.blocked = false;
            continue;
          default:
            fail();
            continue;
        }
      }
      if (value.length === 0) {
        fail();
        continue;
      }
      switch (key) {
        case "label":
          if (value.toLowerCase() === NONE) fail();
          else query.labels.push(value);
          continue;
        case "repo": {
          const id = repoIdForSlug(value, ctx.repos);
          if (id === undefined) fail();
          else query.repos.push(id);
          continue;
        }
        case "status": {
          const status = value.toLowerCase();
          if (!SEARCH_STATUSES.has(status)) fail();
          else query.statuses.push(status);
          continue;
        }
        case "assignee": {
          const resolved = resolveAssignee(value, ctx);
          if (resolved.impossible) fail();
          else if (resolved.unassigned) query.unassigned = true;
          else if (resolved.id) query.assignees.push(resolved.id);
          continue;
        }
        default:
          // Not a qualifier we own; keep it as text.
          break;
      }
    }

    const hashRef = ISSUE_HASH.exec(token);
    if (hashRef) {
      const number = Number(hashRef[2]);
      if (!Number.isInteger(number) || number <= 0) {
        fail();
        continue;
      }
      if (hashRef[1] === undefined) {
        query.identifiers.push({ repoId: null, number });
        continue;
      }
      const repoId = repoIdForSlug(hashRef[1], ctx.repos);
      // `owner/repo#123` is unambiguous: an unknown repo cannot match.
      if (repoId === undefined) fail();
      else query.identifiers.push({ repoId, number });
      continue;
    }

    const shortcodeRef = SHORTCODE_REF.exec(token);
    if (shortcodeRef) {
      const number = Number(shortcodeRef[2]);
      const repoId = repoIdForShortcode(shortcodeRef[1], ctx);
      if (repoId !== undefined && Number.isInteger(number) && number > 0) {
        query.identifiers.push({ repoId, number });
        continue;
      }
      // Unknown shortcode: fall through and treat it as ordinary text.
    }

    text.push(token);
  }

  query.text = text.join(" ");

  // A text search that tokenizes to nothing (for example `%`) cannot match,
  // mirroring the old literal-LIKE behaviour instead of returning everything.
  if (query.text.length > 0 && ftsMatchExpression(query.text) === null) {
    query.impossible = true;
    query.text = "";
  }

  return query;
}

/**
 * Build a safe FTS5 `MATCH` expression from free text. Every term is quoted
 * and prefix-matched, so FTS5 operators in the input are inert. Returns `null`
 * when the text contains no indexable term.
 */
export function ftsMatchExpression(text: string): string | null {
  const terms = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(" AND ");
}

/** True when the query carries a constraint beyond plain free text. */
export function hasSearchConstraints(query: SearchQuery): boolean {
  return (
    query.impossible ||
    query.identifiers.length > 0 ||
    query.labels.length > 0 ||
    query.repos.length > 0 ||
    query.statuses.length > 0 ||
    query.assignees.length > 0 ||
    query.unassigned ||
    query.blocked !== null
  );
}
