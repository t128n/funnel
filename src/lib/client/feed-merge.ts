/**
 * Client page-merge helpers (T4).
 *
 * `mergeFirstPage` / `appendUnique` keep the loaded window intact while an
 * authoritative page (SSE refresh or infinite-scroll append) arrives: the
 * server owns order and totals, the client owns what has already been scrolled
 * past.
 */

/** Drop duplicate keys while preserving first-seen order. */
function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Content equality for the fast path. Identity is not enough: the loaded rows
 * are Svelte proxies while a fresh page is parsed JSON, so deep-equal values
 * always fail `===`. JSON form matches field-for-field for these plain feed
 * rows; a value that cannot be serialized simply takes the merge path.
 */
function sameContent<T>(left: T, right: T): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Merge the authoritative first page into the loaded window.
 *
 * The first page defines both content and order for its rows; anything already
 * loaded that the page did not return (the tail beyond the page size) is kept
 * after it. Keys are deduplicated in both halves.
 */
export function mergeFirstPage<T>(
  loaded: T[],
  first: T[],
  keyOf: (item: T) => string,
): T[] {
  // Fast path: the page is already a duplicate-free, deep-equal prefix of the
  // loaded window. An unchanged SSE refresh then reuses the loaded array, so
  // rows keep their (proxied) object identity and the UI does not re-render.
  if (first.length <= loaded.length) {
    const keys = new Set<string>();
    let unchanged = true;
    for (let index = 0; index < first.length; index += 1) {
      const key = keyOf(first[index]);
      if (
        keys.has(key) ||
        keyOf(loaded[index]) !== key ||
        !sameContent(loaded[index], first[index])
      ) {
        unchanged = false;
        break;
      }
      keys.add(key);
    }
    if (unchanged) {
      for (let index = first.length; index < loaded.length; index += 1) {
        const key = keyOf(loaded[index]);
        if (keys.has(key)) {
          unchanged = false;
          break;
        }
        keys.add(key);
      }
    }
    if (unchanged) return loaded;
  }

  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of uniqueBy(first, keyOf)) {
    seen.add(keyOf(item));
    out.push(item);
  }
  for (const item of loaded) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** One authoritative page plus the metadata that bounds the loaded window. */
export interface AuthoritativePage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

/**
 * Merge or replace the loaded window with an authoritative first page.
 *
 * A page without a cursor is the complete result set: any loaded row it no
 * longer returns has left the view. That is how a card moved out of a board
 * lane is removed immediately instead of lingering in the source lane until a
 * reload. A paged first page keeps the loaded tail (rows beyond the page the
 * client has already scrolled through), but the window is capped at the
 * server's total so the rendered count can never disagree with it.
 */
export function mergeAuthoritativePage<T>(
  loaded: T[],
  page: AuthoritativePage<T>,
  keyOf: (item: T) => string,
): T[] {
  const merged = mergeFirstPage(loaded, page.items, keyOf);
  if (page.nextCursor === null) {
    // No cursor means there is no valid tail beyond this page. `mergeFirstPage`
    // keeps a longer loaded window, which is exactly the stale-row case.
    return merged.length > page.items.length ? uniqueBy(page.items, keyOf) : merged;
  }
  return merged.length > page.total ? merged.slice(0, page.total) : merged;
}

/**
 * Build the owner lane for every key in a set of authoritative lane pages.
 * A row may belong to exactly one lane, so a duplicate is always stale in the
 * lane that the pages no longer name.
 */
export function laneOwners<T>(
  lanes: ReadonlyArray<{ key: string; items: T[] }>,
  keyOf: (item: T) => string,
): Map<string, string> {
  const owners = new Map<string, string>();
  for (const lane of lanes) {
    for (const item of lane.items) owners.set(keyOf(item), lane.key);
  }
  return owners;
}

/** True when the authoritative pages place this row in a different lane. */
export function movedToAnotherLane(
  itemKey: string,
  laneKey: string,
  owners: ReadonlyMap<string, string>,
): boolean {
  const owner = owners.get(itemKey);
  return owner !== undefined && owner !== laneKey;
}

/** Append a page, skipping rows already loaded (and duplicates in the page). */
export function appendUnique<T>(
  loaded: T[],
  page: T[],
  keyOf: (item: T) => string,
): T[] {
  if (page.length === 0) return loaded;
  const seen = new Set(loaded.map(keyOf));
  // Copy lazily: a page of already-loaded rows must not allocate a new window.
  let out: T[] | null = null;
  for (const item of page) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    if (out === null) out = loaded.slice();
    out.push(item);
  }
  return out ?? loaded;
}

/**
 * Drop one row from the loaded window. A deleted row (for example a consumed
 * intake submission) is not part of the authoritative first page any more, and
 * `mergeFirstPage` deliberately keeps rows beyond that page for scrolling, so
 * the owner of the window must remove it explicitly.
 */
export function removeByKey<T>(
  loaded: T[],
  keyOf: (item: T) => string,
  key: string,
): T[] {
  const index = loaded.findIndex((item) => keyOf(item) === key);
  if (index === -1) return loaded;
  return [...loaded.slice(0, index), ...loaded.slice(index + 1)];
}
