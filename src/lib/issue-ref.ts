/**
 * Short, human-readable issue references for dense UI (board cards, lists).
 *
 * The project key comes from instance settings (`repos[].shortcode`), so a
 * card reads `FIT-12` instead of repeating `owner/funnel-issue-tracker#12`.
 * The fallback keeps the UI stable for a mirrored repo that is no longer in
 * the configuration.
 */

/**
 * Derive a readable project key when the config omits one:
 * `funnel-issue-tracker` → `FIT`, `core` → `CORE`.
 */
export function deriveRepoShortcode(repo: string): string {
  const slash = repo.indexOf("/");
  const name = (slash >= 0 ? repo.slice(slash + 1) : repo).replace(/\.git$/i, "");
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const derived = parts.length > 1 ? parts.map((part) => part[0]).join("") : name;
  return (derived.slice(0, 6) || "REPO").toUpperCase();
}

/** Project key for `owner/name`; falls back to the derived key. */
export function repoShortcode(
  repo: string,
  shortcodes: Record<string, string>,
): string {
  return shortcodes[repo] ?? deriveRepoShortcode(repo);
}

/** `FIT-12` for `t128n/funnel-issue-tracker#12`. */
export function issueRef(
  repo: string,
  number: number,
  shortcodes: Record<string, string>,
): string {
  return `${repoShortcode(repo, shortcodes)}-${number}`;
}
