/**
 * Multi-select state for bulk issue and Inbox actions (issue #30).
 *
 * Keys are deliberately durable: an issue is `issue:<owner/name>#<number>` and
 * a staged submission is `submission:<id>`. Mirror ids and feed row keys change
 * when a refresh replaces a row, so selecting by them would silently drop a
 * selection on the next SSE pass. Nothing here prunes keys when a feed
 * refreshes: a selected row that is temporarily absent stays selected until
 * the bulk action or a navigation clears it.
 *
 * This is separate from `selection.svelte.ts`, which only navigates to detail
 * pages.
 */
import { SvelteSet } from "svelte/reactivity";

/** Durable identity of a selectable Inbox or issue row. */
export type BulkKey = `issue:${string}#${number}` | `submission:${string}`;

/** One selected issue, in durable `owner/name` + number form. */
export interface IssueSelectionRef {
  repo: string;
  number: number;
}

/** The selected rows split by kind, in insertion order. */
export interface BulkSelectionSnapshot {
  keys: BulkKey[];
  issues: IssueSelectionRef[];
  submissions: string[];
  count: number;
}

/** Durable selection key for an issue. */
export function issueBulkKey(repo: string, number: number): BulkKey {
  return `issue:${repo}#${number}` as BulkKey;
}

/** Durable selection key for a staged submission. */
export function submissionBulkKey(id: string): BulkKey {
  return `submission:${id}` as BulkKey;
}

/** Parse a durable issue key back to its repo and number, or `null`. */
export function parseIssueBulkKey(key: BulkKey): IssueSelectionRef | null {
  if (!key.startsWith("issue:")) return null;
  const rest = key.slice("issue:".length);
  const hash = rest.lastIndexOf("#");
  if (hash <= 0) return null;
  const number = Number(rest.slice(hash + 1));
  if (!Number.isInteger(number) || number <= 0) return null;
  return { repo: rest.slice(0, hash), number };
}

/** Parse a durable submission key back to its id, or `null`. */
export function parseSubmissionBulkKey(key: BulkKey): string | null {
  return key.startsWith("submission:") ? key.slice("submission:".length) : null;
}

/** A reactive selection set shared by the table and its bulk bar. */
export interface BulkSelectionStore {
  /** Number of selected rows. */
  readonly count: number;
  /** Selected keys, in insertion order. */
  readonly keys: BulkKey[];
  has(key: BulkKey): boolean;
  add(key: BulkKey): void;
  remove(key: BulkKey): void;
  removeMany(keys: Iterable<BulkKey>): void;
  toggle(key: BulkKey): void;
  /** Add every key that is not already selected. */
  addMany(keys: Iterable<BulkKey>): void;
  /** Select every key, or clear the given keys when all are already selected. */
  toggleMany(keys: Iterable<BulkKey>): void;
  clear(): void;
  /** The selected rows split into issues and submissions. */
  snapshot(): BulkSelectionSnapshot;
}

/** Create an isolated selection store (tests use their own instance). */
export function createBulkSelection(): BulkSelectionStore {
  const selected = new SvelteSet<BulkKey>();

  function has(key: BulkKey): boolean {
    return selected.has(key);
  }

  function add(key: BulkKey): void {
    selected.add(key);
  }

  function remove(key: BulkKey): void {
    selected.delete(key);
  }

  function removeMany(keys: Iterable<BulkKey>): void {
    for (const key of keys) selected.delete(key);
  }

  function toggle(key: BulkKey): void {
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
  }

  function addMany(keys: Iterable<BulkKey>): void {
    for (const key of keys) selected.add(key);
  }

  function toggleMany(keys: Iterable<BulkKey>): void {
    const all = [...keys];
    const every = all.length > 0 && all.every((key) => selected.has(key));
    if (every) {
      for (const key of all) selected.delete(key);
    } else {
      for (const key of all) selected.add(key);
    }
  }

  function clear(): void {
    selected.clear();
  }

  function snapshot(): BulkSelectionSnapshot {
    const keys = [...selected];
    const issues: IssueSelectionRef[] = [];
    const submissions: string[] = [];
    for (const key of keys) {
      const issue = parseIssueBulkKey(key);
      if (issue) {
        issues.push(issue);
        continue;
      }
      const submission = parseSubmissionBulkKey(key);
      if (submission !== null) submissions.push(submission);
    }
    return { keys, issues, submissions, count: keys.length };
  }

  return {
    get count() {
      return selected.size;
    },
    get keys() {
      return [...selected];
    },
    has,
    add,
    remove,
    removeMany,
    toggle,
    addMany,
    toggleMany,
    clear,
    snapshot,
  };
}

/** The cockpit's one selection, shared by the tables and the bulk bar. */
export const bulkSelection = createBulkSelection();

/** Clear the shared selection (navigation, success, and tests). */
export function clearBulkSelection(): void {
  bulkSelection.clear();
}
