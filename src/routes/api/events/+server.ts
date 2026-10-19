/**
 * Server-Sent Events stream (SPEC §3.2).
 *
 * Pushes sync updates to every connected browser. The stream sends a `: ping`
 * heartbeat every {@link HEARTBEAT_MS} (12s, inside the mandatory 10–15s band)
 * so intermediaries do not drop it, and subscribes to the in-process bus the
 * sync worker publishes on.
 *
 * Access requires a signed-in `read` session: the stream carries mirror
 * changes, so it is part of the cockpit read surface rather than the public
 * one (`/intake` and `POST /api/intake` stay open).
 */
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import {
  HEARTBEAT_MS,
  subscribe,
  type SyncEvent,
} from "#lib/server/sync/events";

export const GET: RequestHandler = ({ request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the abort event and this write.
        }
      };

      // `retry:` sets the browser reconnect delay; the comment confirms liveness.
      send("retry: 5000\n\n");
      send(": connected\n\n");

      unsubscribe = subscribe((event: SyncEvent) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const close = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = undefined;
        unsubscribe?.();
        unsubscribe = undefined;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
