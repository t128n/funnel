/**
 * Deterministic short codes for repositories, in the Linear `TEAM-123` style.
 *
 * A repo renders as its name initials plus a stable checksum of the full
 * `owner/name`, so two repos that share initials still receive distinct codes.
 * The mapping is a pure function of the slug: the same repo always yields the
 * same key across processes and restarts. This module is deliberately
 * dependency-free so it can be imported from both client components and tests.
 */

/**
 * Uppercased initials of the repo name (the part after `owner/`), at most
 * `max` letters. Single-word names fall back to their own leading letters so a
 * repo like `web` still yields a usable key.
 */
function initials(name: string, max: number): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "REPO";
  // A single-word name reads better as its own leading letters than as one
  // initial: `web` → `WEB`, not `W`.
  if (words.length === 1) return words[0]!.toUpperCase().slice(0, max);
  return words.map((word) => word[0]!.toUpperCase()).join("").slice(0, max);
}

/**
 * FNV-1a (32-bit) of `input`, rendered as fixed-width uppercase base36. Stable
 * across runs since it uses only integer arithmetic.
 */
function checksum(input: string, length: number): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const encoded = (hash >>> 0).toString(36).toUpperCase();
  return encoded.padStart(length, "0").slice(0, length);
}

/** `owner/name` → an initials + checksum code such as `FITX4A`. */
export function repoShortcode(repo: string): string {
  const slash = repo.indexOf("/");
  const name = slash === -1 ? repo : repo.slice(slash + 1);
  return `${initials(name || "repo", 3)}${checksum(repo, 3)}`;
}

/** `owner/name` + issue number → a stable display key such as `FITX4A-12`. */
export function issueKey(repo: string, number: number): string {
  return `${repoShortcode(repo)}-${number}`;
}
