/**
 * Server-Sent Events client (SPEC §3.2).
 *
 * Subscribes to `/api/events` and forwards every named sync event to a
 * callback. The browser's `EventSource` already reconnects on its own after the
 * `retry:` hint the server sends, so this wrapper only needs to manage the
 * listener lifecycle.
 */
export interface FunnelEvent {
  type: string;
  [key: string]: unknown;
}

/** Event names the server publishes. */
export const EVENT_TYPES = ["sync", "issues", "intake"] as const;

/**
 * Open the realtime stream. Returns a cleanup function that closes it.
 * A no-op during SSR.
 */
export function connectEvents(onEvent: (event: FunnelEvent) => void): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  const source = new EventSource("/api/events");
  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (event) => {
      try {
        onEvent(JSON.parse((event as MessageEvent).data) as FunnelEvent);
      } catch {
        // Malformed payload: ignore rather than tear down the stream.
      }
    });
  }

  return () => source.close();
}
