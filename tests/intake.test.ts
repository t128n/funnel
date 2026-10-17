import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { getSubmission } from "#lib/server/intake/staging";
import { resetEventBus, subscribe } from "#lib/server/sync/events";
import { OPTIONS, POST } from "#/routes/api/intake/+server";

function intakeReq(body: string): Request {
  return new Request("http://x/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function post(payload: unknown): Promise<Response> {
  return POST({ request: intakeReq(JSON.stringify(payload)) } as never);
}

beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
  resetEventBus();
});

describe("POST /api/intake", () => {
  test("stages the submission and returns 201 with an id", async () => {
    const res = await post({
      title: "Crash on save",
      body: "Steps to reproduce",
      source: "cli",
    });

    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toBeString();
    expect(getSubmission(id)).toEqual({
      id,
      title: "Crash on save",
      body: "Steps to reproduce",
      source: "cli",
      createdAt: expect.any(Number),
    });
  });

  test("body and source are optional", async () => {
    const res = await post({ title: "Minimal" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const row = getSubmission(id);
    expect(row?.body).toBe("");
    expect(row?.source).toBeNull();
  });

  test("ignores unknown fields", async () => {
    const res = await post({ title: "Extra", urgent: true, repo: "evil/repo" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(getSubmission(id)?.title).toBe("Extra");
  });

  test("rejects malformed JSON", async () => {
    const res = await POST({
      request: new Request("http://x/api/intake", {
        method: "POST",
        body: "{not json",
      }),
    } as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: "Request body must be valid JSON",
    });
  });

  test("rejects a missing or blank title", async () => {
    for (const payload of [{}, { title: "   " }, { title: 42 }]) {
      const res = await post(payload);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { message: string; issues: string[] };
      expect(body.message).toBe("Invalid intake submission");
      expect(body.issues.length).toBeGreaterThan(0);
    }
  });

  test("rejects a title over 256 characters", async () => {
    const res = await post({ title: "x".repeat(257) });
    expect(res.status).toBe(400);
  });

  test("sends open CORS headers", async () => {
    const res = await post({ title: "CORS" });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("publishes a created event for live Inbox updates", async () => {
    const events: Array<Record<string, unknown>> = [];
    subscribe((event) => events.push(event as Record<string, unknown>));

    const res = await post({ title: "Live" });
    const { id } = (await res.json()) as { id: string };

    expect(events).toContainEqual(
      expect.objectContaining({ type: "intake", action: "created", id }),
    );
  });
});

describe("OPTIONS /api/intake", () => {
  test("answers the CORS preflight", () => {
    const res = OPTIONS({} as never);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "Content-Type",
    );
  });
});
