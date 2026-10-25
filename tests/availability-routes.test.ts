import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { authUser } from "#lib/server/db/schema";
import {
  readCalendarFeed,
  readWorkHours,
  listWindows,
} from "#lib/server/planning/day-store";
import { findCalendarFeed } from "#lib/server/planning/day-queries";
import { PUT } from "#/routes/api/me/availability/+server";
import {
  DELETE,
  POST,
} from "#/routes/api/me/calendar-feed/+server";

const USER = "availability_user";

const READ_LOCALS = {
  user: {
    id: USER,
    name: "Viewer",
    email: "viewer@example.com",
    image: null,
    role: "read",
  },
  session: null,
};
const ANON_LOCALS = { user: null, session: null };

function seedUser(): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id: USER,
      name: USER,
      email: `${USER}@example.com`,
      emailVerified: true,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

function validBody() {
  return {
    timezone: "Europe/Berlin",
    start_minute: 540,
    end_minute: 1020,
    work_days: [1, 2, 3, 4, 5],
    buffer_percent: 20,
    windows: [
      { label: "Lunch", weekday: 1, date: null, start_minute: 720, end_minute: 780 },
      {
        label: "Dentist",
        weekday: null,
        date: "2026-10-27",
        start_minute: 600,
        end_minute: 660,
      },
    ],
  };
}

function putRequest(body: unknown): Request {
  return new Request("http://x/api/me/availability", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function feedRequest(method: "POST" | "DELETE"): Request {
  return new Request("http://x/api/me/calendar-feed", { method });
}

async function put(body: unknown, locals: unknown = READ_LOCALS) {
  return PUT({ request: putRequest(body), locals } as never);
}

beforeEach(() => {
  seedUser();
});

afterEach(() => {
  db.delete(authUser).where(eq(authUser.id, USER)).run();
});

describe("PUT /api/me/availability", () => {
  test("test_session_required", async () => {
    const availability = await put(validBody(), ANON_LOCALS);
    expect(availability.status).toBe(401);

    const create = await POST({
      request: feedRequest("POST"),
      locals: ANON_LOCALS,
    } as never);
    expect(create.status).toBe(401);

    const remove = await DELETE({
      request: feedRequest("DELETE"),
      locals: ANON_LOCALS,
    } as never);
    expect(remove.status).toBe(401);
  });

  test("test_read_role", async () => {
    const res = await put(validBody());
    expect(res.status).toBe(204);
  });

  test("test_saves", async () => {
    const res = await put(validBody());
    expect(res.status).toBe(204);

    expect(readWorkHours(USER)).toEqual({
      timezone: "Europe/Berlin",
      startMinute: 540,
      endMinute: 1020,
      workDays: [1, 2, 3, 4, 5],
      bufferPercent: 20,
    });

    const windows = listWindows(USER);
    expect(windows).toHaveLength(2);
    expect(windows.map((window) => window.label).sort()).toEqual([
      "Dentist",
      "Lunch",
    ]);
    expect(windows.find((window) => window.label === "Lunch")).toMatchObject({
      weekday: 1,
      date: null,
      startMinute: 720,
      endMinute: 780,
    });
    expect(windows.find((window) => window.label === "Dentist")).toMatchObject({
      weekday: null,
      date: "2026-10-27",
      startMinute: 600,
      endMinute: 660,
    });

    // A second save replaces the windows instead of appending.
    const next = validBody();
    next.windows = [
      { label: "School", weekday: 3, date: null, start_minute: 900, end_minute: 960 },
    ];
    expect((await put(next)).status).toBe(204);
    expect(listWindows(USER).map((window) => window.label)).toEqual(["School"]);
  });

  test("test_bad_payload", async () => {
    const cases: { name: string; mutate: (body: ReturnType<typeof validBody>) => void }[] =
      [
        {
          name: "bad timezone",
          mutate: (body) => {
            body.timezone = "Mars/Base";
          },
        },
        {
          name: "start >= end",
          mutate: (body) => {
            body.start_minute = 1020;
            body.end_minute = 540;
          },
        },
        {
          name: "both weekday and date",
          mutate: (body) => {
            body.windows[0].date = "2026-10-27";
          },
        },
        {
          name: "neither weekday nor date",
          mutate: (body) => {
            body.windows[0].weekday = null as never;
            body.windows[0].date = null as never;
          },
        },
        {
          name: "window out of bounds",
          mutate: (body) => {
            body.windows[0].end_minute = 1441;
          },
        },
        {
          name: "empty window",
          mutate: (body) => {
            body.windows[0].start_minute = 720;
            body.windows[0].end_minute = 720;
          },
        },
        {
          name: "empty label",
          mutate: (body) => {
            body.windows[0].label = "  ";
          },
        },
        {
          name: "long label",
          mutate: (body) => {
            body.windows[0].label = "x".repeat(61);
          },
        },
        {
          name: "impossible window date",
          mutate: (body) => {
            body.windows[1].date = "2026-02-30";
          },
        },
        {
          name: "weekday out of range",
          mutate: (body) => {
            body.windows[0].weekday = 8;
          },
        },
      ];

    for (const { name, mutate } of cases) {
      const body = validBody();
      mutate(body);
      const res = await put(body);
      expect({ name, status: res.status }).toEqual({ name, status: 400 });
    }

    // Nothing from a rejected payload was written.
    expect(readWorkHours(USER)).toBeNull();
    expect(listWindows(USER)).toEqual([]);
  });
});

describe("/api/me/calendar-feed", () => {
  test("test_feed_url", async () => {
    const res = await POST({
      request: feedRequest("POST"),
      locals: READ_LOCALS,
    } as never);
    expect(res.status).toBe(200);

    const first = (await res.json()) as {
      token: string;
      url: string;
      hint: string;
      createdAt: number;
    };
    expect(first.token).toHaveLength(43);
    expect(first.hint).toBe(first.token.slice(0, 8));
    expect(first.url).toBe(`http://x/api/calendar/${first.token}.ics`);
    expect(typeof first.createdAt).toBe("number");
    expect(findCalendarFeed(first.token)).toEqual({ userId: USER });

    const second = await POST({
      request: feedRequest("POST"),
      locals: READ_LOCALS,
    } as never);
    const rotated = (await second.json()) as { token: string; url: string };
    expect(rotated.token).not.toBe(first.token);
    expect(findCalendarFeed(first.token)).toBeNull();
    expect(findCalendarFeed(rotated.token)).toEqual({ userId: USER });
  });

  test("test_revoke", async () => {
    const created = await POST({
      request: feedRequest("POST"),
      locals: READ_LOCALS,
    } as never);
    const { token } = (await created.json()) as { token: string };
    expect(readCalendarFeed(USER)).not.toBeNull();

    const removed = await DELETE({
      request: feedRequest("DELETE"),
      locals: READ_LOCALS,
    } as never);
    expect(removed.status).toBe(204);
    expect(findCalendarFeed(token)).toBeNull();
    expect(readCalendarFeed(USER)).toBeNull();

    const again = await DELETE({
      request: feedRequest("DELETE"),
      locals: READ_LOCALS,
    } as never);
    expect(again.status).toBe(204);
  });
});
