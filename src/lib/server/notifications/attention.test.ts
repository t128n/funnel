import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetConfigCache, setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authUser,
  mirrorUser,
  stateIssueWaiting,
  stateNotification,
} from "#lib/server/db/schema";
import { upsertIssue, upsertRepo, type UserRecord } from "#lib/server/sync/mirror";
import { runAttentionNotifications } from "#lib/server/sync/worker";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import type { AttentionBreach } from "#lib/server/attention/rules";
import {
  notifyAttentionBreaches,
  planAttentionNotifications,
  utcNotificationDay,
} from "./attention";
import type { Recipient } from "./types";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-05T12:00:00Z");

const ann: Recipient = {
  userId: "u1",
  externalId: "42",
  login: "ann",
  avatarUrl: "",
};
const bob: Recipient = {
  userId: "u2",
  externalId: "43",
  login: "bob",
  avatarUrl: "",
};

function assignee(recipient: Recipient) {
  return {
    externalId: recipient.externalId,
    forge: "github",
    instance: "github.com",
    login: recipient.login,
    avatarUrl: recipient.avatarUrl,
  };
}

function breach(overrides: Partial<AttentionBreach> = {}): AttentionBreach {
  return {
    id: "first_response:orgA/core#7",
    rule: "first_response",
    repo: "orgA/core",
    number: 7,
    title: "Fix the thing",
    summary: "No response from anyone other than the author after 5 days",
    daysOverdue: 2,
    assignees: [
      {
        externalId: "42",
        forge: "github",
        instance: "github.com",
        login: "ann",
        avatarUrl: "",
      },
    ],
    ...overrides,
  };
}

function seedUser(id: string, externalId: string, login: string): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id,
      name: id,
      email: `${id}@example.com`,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(authAccount)
    .values({
      id: `account-${id}`,
      accountId: externalId,
      providerId: "github",
      userId: id,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(mirrorUser)
    .values({
      externalId,
      forge: "github",
      instance: "github.com",
      login,
      avatarUrl: "",
      url: "",
    })
    .run();
}

function user(externalId: string, login: string): UserRecord {
  return {
    id: 0,
    externalId,
    forge: "github",
    instance: "github.com",
    login,
    avatarUrl: "",
    url: "",
  };
}

function seedBreachingIssue(assignee: UserRecord | null): void {
  upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  });
  upsertIssue(
    {
      externalId: "107",
      repoId: 1,
      number: 7,
      kind: "issue",
      title: "Fix the thing",
      body: "",
      state: "open",
      stateReason: null,
      author: user("1", "author"),
      milestoneNumber: null,
      url: "",
      createdAt: NOW - 5 * DAY_MS,
      updatedAt: NOW - DAY_MS,
      closedAt: null,
      labels: [],
      assignees: assignee ? [assignee] : [],
      comments: [],
    },
    {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: false,
    },
  );
}

beforeEach(() => {
  clearMirror();
  db.delete(stateNotification).run();
  db.delete(stateIssueWaiting).run();
  db.delete(authAccount).run();
  db.delete(authUser).run();
  resetConfigCache();
});

afterEach(() => {
  clearMirror();
  db.delete(stateNotification).run();
  db.delete(stateIssueWaiting).run();
  db.delete(authAccount).run();
  db.delete(authUser).run();
  resetConfigCache();
});

describe("planAttentionNotifications", () => {
  test("creates one draft per assignee with the UTC-day dedupe key", () => {
    const recipients = new Map([
      [ann.externalId, ann],
      [bob.externalId, bob],
    ]);
    const drafts = planAttentionNotifications(
      [
        breach({
          assignees: [assignee(ann), assignee(bob)],
        }),
      ],
      recipients,
      NOW,
    );

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.userId)).toEqual(["u1", "u2"]);
    expect(drafts[0]).toMatchObject({
      kind: "sla",
      dedupeKey: "sla:first_response:orgA/core#7:u1:2026-11-05",
      createdAt: NOW,
      url: "/issues/orgA/core/7",
      title: "First response: orgA/core#7",
      body: "No response from anyone other than the author after 5 days",
    });
  });

  test("same-day duplicates collapse but the next UTC day notifies again", () => {
    const recipients = new Map([[ann.externalId, ann]]);
    const first = planAttentionNotifications([breach()], recipients, NOW);
    const sameDay = planAttentionNotifications(
      [breach(), breach()],
      recipients,
      NOW + 60_000,
    );
    const nextDay = planAttentionNotifications(
      [breach()],
      recipients,
      NOW + DAY_MS,
    );

    expect(first).toHaveLength(1);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].dedupeKey).toBe(first[0].dedupeKey);
    expect(nextDay).toHaveLength(1);
    expect(nextDay[0].dedupeKey).toBe(
      "sla:first_response:orgA/core#7:u1:2026-11-06",
    );
    expect(utcNotificationDay(NOW)).toBe("2026-11-05");
  });

  test("skips assignees without a linked Funnel user", () => {
    const recipients = new Map([[ann.externalId, ann]]);
    const drafts = planAttentionNotifications(
      [
        breach({
          assignees: [
            assignee(ann),
            {
              externalId: "99",
              forge: "github",
              instance: "github.com",
              login: "ghost",
              avatarUrl: "",
            },
          ],
        }),
      ],
      recipients,
      NOW,
    );
    expect(drafts.map((draft) => draft.userId)).toEqual(["u1"]);
  });

  test("does not create drafts when there are no breaches", () => {
    expect(planAttentionNotifications([], new Map(), NOW)).toEqual([]);
  });
});

describe("notifyAttentionBreaches", () => {
  test("resolves linked users and dedupes same-day inserts", () => {
    seedUser("u1", "42", "ann");

    expect(notifyAttentionBreaches([breach()], NOW)).toBe(1);
    expect(notifyAttentionBreaches([breach()], NOW)).toBe(0);
    expect(notifyAttentionBreaches([breach()], NOW + DAY_MS)).toBe(1);
  });

  test("skips an unresolved assignee", () => {
    expect(notifyAttentionBreaches([breach()], NOW)).toBe(0);
  });
});

describe("runAttentionNotifications", () => {
  test("writes nothing when notifications are disabled", async () => {
    seedUser("u1", "42", "ann");
    seedBreachingIssue(user("42", "ann"));
    setConfig({
      ...TEST_CONFIG,
      notifications: { ...TEST_CONFIG.notifications, enabled: false },
    });

    expect(await runAttentionNotifications(NOW)).toBe(0);
    expect(db.select().from(stateNotification).all()).toEqual([]);
  });

  test("evaluates rules and notifies a resolved assignee", async () => {
    seedUser("u1", "42", "ann");
    seedBreachingIssue(user("42", "ann"));
    setConfig(TEST_CONFIG);

    expect(await runAttentionNotifications(NOW)).toBe(1);
    const [row] = db.select().from(stateNotification).all();
    expect(row).toMatchObject({
      userId: "u1",
      kind: "sla",
      url: "/issues/orgA/core/7",
      title: "First response: orgA/core#7",
    });
  });

  test("does not notify for issues with no resolved assignee", async () => {
    seedBreachingIssue(user("42", "ann"));
    setConfig(TEST_CONFIG);

    expect(await runAttentionNotifications(NOW)).toBe(0);
  });
});
