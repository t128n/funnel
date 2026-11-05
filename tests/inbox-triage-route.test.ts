import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { createSubmission, getSubmission } from "#lib/server/intake/staging";
import { actions } from "#/routes/(app)/inbox/+page.server";

const tableSource = readFileSync(
  new URL("../src/lib/components/inbox/InboxTable.svelte", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../src/lib/components/inbox/SubmissionDetail.svelte", import.meta.url),
  "utf8",
);
const selectionSource = readFileSync(
  new URL("../src/lib/client/selection.svelte.ts", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../src/routes/(app)/inbox/+layout.server.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/routes/(app)/inbox/+page.svelte", import.meta.url),
  "utf8",
);

function writeLocals() {
  return { user: { id: "triager", role: "write" }, session: null };
}

function formRequest(path: string, fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request(`http://x${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  db.delete(stateTriageEvent).run();
  db.delete(stateIntakeSubmission).run();
});

describe("inbox route actions", () => {
  test("owns the queue decisions so a post settles on /inbox", () => {
    expect(Object.keys(actions).sort()).toEqual(["accept", "dismiss", "undo"]);
  });

  test("dismiss archives the row with a reason and returns the undo event", async () => {
    const { id } = createSubmission({ title: "Webhook retries are silent" });

    const result = (await actions.dismiss({
      request: formRequest("/inbox?/dismiss", {
        id,
        reason: "Duplicate of #12",
      }),
      locals: writeLocals(),
    } as never)) as { dismissed: true; id: string; eventId: string };

    expect(result).toMatchObject({ dismissed: true, id });
    expect(result.eventId).toBeString();
    expect(getSubmission(id)?.archivedAt).toBeNumber();
    expect(getSubmission(id)?.dismissReason).toBe("Duplicate of #12");
  });

  test("undo restores the dismissed row and appends an undone event", async () => {
    const { id } = createSubmission({ title: "Restore me" });
    const dismissed = (await actions.dismiss({
      request: formRequest("/inbox?/dismiss", {
        id,
        reason: "Wrong report",
      }),
      locals: writeLocals(),
    } as never)) as { eventId: string };

    const result = await actions.undo({
      request: formRequest("/inbox?/undo", { eventId: dismissed.eventId }),
      locals: writeLocals(),
    } as never);

    expect(result).toEqual({ undone: true, id });
    expect(getSubmission(id)?.archivedAt).toBeNull();
    expect(
      db
        .select()
        .from(stateTriageEvent)
        .all()
        .map((event) => event.action),
    ).toEqual(["dismissed", "undone"]);
  });

  test("a failed decision returns a failure instead of navigating", async () => {
    const result = (await actions.dismiss({
      request: formRequest("/inbox?/dismiss", { id: "missing", reason: "gone" }),
      locals: writeLocals(),
    } as never)) as { status: number; data: { message: string } };

    expect(result.status).toBe(404);
    expect(result.data.message).toBeTruthy();
  });

  test("read-only sessions cannot dismiss", async () => {
    const result = (await actions.dismiss({
      request: formRequest("/inbox?/dismiss", { id: "any" }),
      locals: { user: { id: "reader", role: "read" }, session: null },
    } as never)) as { status: number; data: { message: string } };

    expect(result.status).toBe(403);
    expect(result.data.message).toBe("Write access required");
  });
});

describe("inbox queue wiring", () => {
  test("queue forms target the inbox route and preserve the active filter", () => {
    expect(tableSource).toContain("inboxActionUrl(page.url.search, 'accept')");
    expect(tableSource).toContain("inboxActionUrl(page.url.search, 'dismiss')");
    expect(tableSource).toContain("inboxActionUrl(page.url.search, 'undo')");
    expect(tableSource).toContain("action={acceptAction}");
    expect(tableSource).toContain("action={dismissAction}");
    expect(tableSource).toContain("action={undoAction}");
    expect(tableSource).not.toMatch(/submissionPath\([^)]*\)\}\?\/accept/);
    expect(tableSource).not.toMatch(/submissionPath\([^)]*\)\}\?\/dismiss/);
  });

  test("success drops the consumed row and restores it on failure", () => {
    expect(tableSource).toContain("onremove?.(`submission:${id}`)");
    expect(tableSource).toContain("restoreSubmission(id)");
    expect(tableSource).toContain("onnotice?.(`Submission ${verb}");
  });

  test("returning from a detail decision invalidates the destination queue", () => {
    expect(detailSource).toContain("clearSelection({ invalidateAll: true })");
    expect(selectionSource).toContain("invalidateAll?: boolean");
  });

  test("the summary counts the projected rows, not the stale loaded tail", () => {
    expect(layoutSource).toContain("issueTotal: page.total - submissionTotal");
    expect(pageSource).toContain("inboxFeed.nextCursor === null");
    expect(pageSource).toContain("data.inbox.issueTotal");
  });
});
