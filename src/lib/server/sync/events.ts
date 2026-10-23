import { bumpRevision } from "./revision";

/**
 * In-process Server-Sent Events broadcast bus (SPEC §3.2).
 *
 * The sync worker publishes after each repo cycle; every open `/api/events`
 * stream subscribes. Funnel is a single long-lived process (adapter-node), so a
 * plain in-memory `Set` is all the fan-out that is needed — no Redis, no
 * external broker. `clientCount` also drives the active/idle polling cadence
 * (SPEC §7.2).
 */
export interface SyncEvent {
  /** SSE `event:` name, e.g. `"issues"` or `"sync"`. */
  type: string;
  [key: string]: unknown;
}

/**
 * SSE heartbeat interval. SPEC §3.2 mandates a `: ping` every 10–15s so Bun
 * and intermediaries do not drop the connection.
 */
export const HEARTBEAT_MS = 12_000;

type Listener = (event: SyncEvent) => void;

const listeners = new Set<Listener>();

/** Register a listener; the returned function unsubscribes it. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Broadcast an event to every open stream. A throwing listener is isolated. */
export function publish(event: SyncEvent): void {
  // A published event always follows a mirror write (or a sync status change),
  // so advance the revision before delivery: every listener that reacts by
  // reading the mirror then misses any cache built from the old state.
  bumpRevision();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A dead controller must not break delivery to the others.
    }
  }
}

/** Number of active SSE streams (drives the active/idle poll interval). */
export function clientCount(): number {
  return listeners.size;
}

/** Drop all listeners (tests). */
export function resetEventBus(): void {
  listeners.clear();
}
