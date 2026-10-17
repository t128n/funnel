import { afterEach, describe, expect, test } from "bun:test";
import {
  HEARTBEAT_MS,
  publish,
  resetEventBus,
} from "#lib/server/sync/events";
import { GET } from "#/routes/api/events/+server";

afterEach(() => {
  resetEventBus();
});

function open() {
  const controller = new AbortController();
  const response = GET({
    request: new Request("http://x/api/events", { signal: controller.signal }),
  } as never);
  return { controller, response };
}

describe("GET /api/events", () => {
  test("sets the SSE headers and a spec-compliant heartbeat", () => {
    const { controller, response } = open();
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(HEARTBEAT_MS).toBeGreaterThanOrEqual(10_000);
    expect(HEARTBEAT_MS).toBeLessThanOrEqual(15_000);
    controller.abort();
  });

  test("streams retry, a connected comment, then published events", async () => {
    const { controller, response } = open();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    expect(decoder.decode((await reader.read()).value)).toContain(
      "retry: 5000",
    );
    expect(decoder.decode((await reader.read()).value)).toContain(
      ": connected",
    );

    publish({ type: "issues", repo: "orgA/core", numbers: [1, 2] });
    const event = decoder.decode((await reader.read()).value);
    expect(event).toContain("event: issues");
    expect(event).toContain('"numbers":[1,2]');

    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
});
