/**
 * A monotonic signal the SSE bridge bumps whenever the server reports a change.
 *
 * SvelteKit's `invalidateAll()` refreshes route data (the streams), but the
 * Inspector Pane fetches its detail outside the load graph, so it subscribes to
 * this counter and refetches whenever it ticks.
 */
import { writable } from "svelte/store";

export const refreshSignal = writable(0);

/** Notify subscribers that mirror data may have changed. */
export function bumpRefresh(): void {
  refreshSignal.update((value) => value + 1);
}
