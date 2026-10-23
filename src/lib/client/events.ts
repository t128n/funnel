/**
 * Server-Sent Events client (SPEC §3.2).
 *
 * Subscribes to `/api/events` and forwards every named sync event to a
 * callback. The browser's `EventSource` already reconnects on its own after the
 * `retry:` hint the server sends, so this wrapper only needs to manage the
 * listener lifecycle.
 *
 * The stream is a module-level singleton: a tab has one `EventSource` no matter
 * how many features subscribe (the cockpit layout and native notifications
 * share it). The source opens on the first subscriber and closes with the last.
 */
export interface FunnelEvent {
  type: string;
  [key: string]: unknown;
}

/** Event names the server publishes. */
export const EVENT_TYPES = ["sync", "issues", "intake", "settings", "notifications"] as const;

type EventListener = (event: FunnelEvent) => void;

const listeners = new Set<EventListener>();
let source: EventSource | null = null;

function broadcast(event: FunnelEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // A dead subscriber must not break delivery to the others.
    }
  }
}

/**
 * Open the shared stream if it is not already open. No-op during SSR or when
 * the browser has no `EventSource`.
 */
function ensureSource(): void {
  if (source !== null) return;
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;

  const next = new EventSource("/api/events");
  source = next;

  for (const type of EVENT_TYPES) {
    next.addEventListener(type, (event) => {
      try {
        broadcast(JSON.parse((event as MessageEvent).data) as FunnelEvent);
      } catch {
        // Malformed payload: ignore rather than tear down the stream.
      }
    });
  }
}

/**
 * Subscribe to the shared realtime stream. Returns a cleanup function that
 * unsubscribes this callback; the final subscriber also closes the source.
 * A no-op during SSR.
 */
export function connectEvents(onEvent: EventListener): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  listeners.add(onEvent);
  ensureSource();

  return () => {
    listeners.delete(onEvent);
    if (listeners.size === 0 && source !== null) {
      source.close();
      source = null;
    }
  };
}
