import { describe, expect, mock, test } from "bun:test";

// `svelte-sonner`'s entry imports precompiled `.svelte` components, which the
// bare `bun test` loader cannot parse. The optimistic store only ever calls
// `toast`/`toast.error`, so stub it before the module is imported.
mock.module("svelte-sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));

const {
  mutate,
  overlayKey,
  projectInboxEntries,
  reconcileSnoozedIssues,
  removeSnoozedIssue,
  restoreSnoozedIssue,
} = await import("#lib/client/optimistic.svelte");

/** A minimal untriaged inbox issue entry. */
function issueEntry(number: number, status: string | null = null) {
  return {
    kind: "issue" as const,
    issue: {
      repoId: 1,
      repo: "orgA/core",
      number,
      title: `Issue ${number}`,
      state: "open",
      stateReason: null,
      status,
      priority: null,
      impact: null,
      urgency: null,
      size: null,
      blocked: false,
      labelConflict: false,
      createdAt: 0,
      updatedAt: 0,
      closedAt: null,
      author: null,
      assignees: [],
      labels: [],
    },
  };
}

/** A staged submission entry (opaque here; only its id matters). */
function submissionEntry(id: string) {
  return { kind: "submission" as const, submission: { id } };
}

/** Apply an optimistic patch without a network round-trip. */
async function overlay(
  repo: string,
  number: number,
  patch: { status: string | null },
) {
  await mutate({
    key: overlayKey(repo, number),
    patch,
    commit: async () => ({ ok: true, value: undefined }),
  });
}

// Overlays live in module state for the whole file, so each test uses its own
// issue number to stay independent.
describe("projectInboxEntries", () => {
  test("keeps untriaged issues and submissions", () => {
    const entries = [submissionEntry("s1"), issueEntry(1)] as never[];
    expect(projectInboxEntries(entries)).toHaveLength(2);
  });

  test("drops an issue the moment a status overlay is applied", async () => {
    const entries = [issueEntry(10)] as never[];
    expect(projectInboxEntries(entries)).toHaveLength(1);
    await overlay("orgA/core", 10, { status: "todo" });
    expect(projectInboxEntries(entries)).toHaveLength(0);
  });

  test("restores the issue when the status overlay is cleared (undo)", async () => {
    const entries = [issueEntry(20)] as never[];
    await overlay("orgA/core", 20, { status: "todo" });
    expect(projectInboxEntries(entries)).toHaveLength(0);

    await overlay("orgA/core", 20, { status: null });
    const projected = projectInboxEntries(entries) as never as {
      issue: { status: string | null };
    }[];
    expect(projected).toHaveLength(1);
    expect(projected[0].issue.status).toBe(null);
  });

  test("leaves unrelated issues in the queue", async () => {
    const entries = [issueEntry(30), issueEntry(31)] as never[];
    await overlay("orgA/core", 30, { status: "backlog" });
    const projected = projectInboxEntries(entries) as never as {
      issue: { number: number };
    }[];
    expect(projected).toHaveLength(1);
    expect(projected[0].issue.number).toBe(31);
  });

  test("drops a snoozed issue until it is restored or resurfaced", () => {
    const entries = [issueEntry(40)] as never[];
    removeSnoozedIssue("orgA/core", 40);
    expect(projectInboxEntries(entries)).toHaveLength(0);

    restoreSnoozedIssue("orgA/core", 40);
    expect(projectInboxEntries(entries)).toHaveLength(1);

    removeSnoozedIssue("orgA/core", 40);
    // The authoritative Inbox showing the issue again means its snooze is over.
    reconcileSnoozedIssues([issueEntry(40).issue] as never);
    expect(projectInboxEntries(entries)).toHaveLength(1);
  });
});
