/**
 * Mirror revision counter (SPEC §4, plan T4).
 *
 * Every read cache over the disposable mirror is keyed by this monotonically
 * increasing counter instead of a wall-clock timestamp. `publish` bumps it
 * after every repo cycle or mutation, so a cache hit always reflects the
 * mirror state as of the last write — a write that published can never leave
 * a stale option list or page total behind.
 */
let revision = 0;

/** Current mirror revision. */
export function mirrorRevision(): number {
  return revision;
}

/**
 * Advance the revision and return the new value. Called by the SSE bus on
 * every `publish`, i.e. immediately after a mirror write or sync cycle.
 */
export function bumpRevision(): number {
  revision += 1;
  return revision;
}

/** Reset to zero (tests only). Caches keyed by the old revision are dropped. */
export function resetMirrorRevision(): void {
  revision = 0;
}
