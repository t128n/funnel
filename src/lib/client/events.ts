/**
 * Server-Sent Events client (SPEC §3.2).
 *
 * Subscribes to `/api/events` and forwards every named sync event to a
 * callback. The browser's `EventSource` already reconnects after transient
 * drops (it stays CONNECTING), but a fatal error closes it for good; this
 * wrapper then reopens the stream while subscribers remain.
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
/** Pending reopen after a fatal stream error; `undefined` means none. */
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function clearRetry(): void {
  if (retryTimer !== undefined) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
}

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
 * Open the shared stream if it is not already open. No-op during SSR, when
 * the browser has no `EventSource`, or when nobody is listening.
 */
function ensureSource(): void {
  if (source !== null || listeners.size === 0) return;
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;

  const next = new EventSource("/api/events");
  source = next;

  // The browser retries transient drops itself (the source is CONNECTING).
  // A fatal error leaves it CLOSED for good, so drop the dead singleton and
  // reopen it while subscribers remain.
  next.onerror = () => {
    if (next.readyState !== EventSource.CLOSED) return;
    if (source !== next) return;
    source = null;
    next.close();
    if (listeners.size === 0 || retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      ensureSource();
    }, 2000);
  };

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
    if (listeners.size === 0) {
      clearRetry();
      if (source !== null) {
        source.close();
        source = null;
      }
    }
  };
}
