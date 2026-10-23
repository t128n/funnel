/**
 * A monotonic signal the SSE bridge bumps whenever the server reports a change.
 *
 * SvelteKit's `invalidateAll()` refreshes route data (the streams), but the
 * Inspector Pane fetches its detail outside the load graph, so it subscribes to
 * this counter and refetches whenever it ticks.
 *
 * The payload also carries the scope of the change. `issues` events name the
 * repo (and the changed numbers); everything else, and any burst that spans
 * more than one repo, is unscoped. Consumers must treat a missing `repo` as
 * "everything may have changed".
 */
import { writable } from "svelte/store";

/** The issues a refresh may have touched; empty fields mean "all". */
export interface RefreshScope {
  repo?: string;
  numbers?: number[];
}

/** The store payload: a monotonic sequence plus the scope that caused it. */
export interface RefreshPayload extends RefreshScope {
  seq: number;
}

export const refreshSignal = writable<RefreshPayload>({ seq: 0 });

/**
 * Notify subscribers that mirror data may have changed. Pass the event scope
 * to let the Inspector skip refetches for unrelated issues; omit it when the
 * whole view may be stale.
 */
export function bumpRefresh(scope: RefreshScope = {}): void {
  refreshSignal.update(({ seq }) => {
    const next: RefreshPayload = { seq: seq + 1 };
    if (scope.repo !== undefined) next.repo = scope.repo;
    if (scope.numbers !== undefined) next.numbers = [...scope.numbers];
    return next;
  });
}
