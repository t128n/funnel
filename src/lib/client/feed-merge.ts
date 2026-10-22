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

/** Append a page, skipping rows already loaded (and duplicates in the page). */
export function appendUnique<T>(
  loaded: T[],
  page: T[],
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set(loaded.map(keyOf));
  const out = [...loaded];
  for (const item of page) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
