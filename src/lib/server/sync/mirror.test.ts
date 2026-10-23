import { beforeEach, describe, expect, test } from "bun:test";
import { clearMirror } from "#tests/mirror-helpers";
import { db } from "#lib/server/db/index";
import { mirrorComment, mirrorThreadAssignee } from "#lib/server/db/schema";
import * as mirror from "./mirror";

const GITHUB = { forge: "github", instance: "github.com" } as const;

beforeEach(() => {
  clearMirror();
});

function seedRepo() {
  return mirror.upsertRepo({
    externalId: "1",
    ...GITHUB,
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  });
}

function user(externalId: string, login: string): mirror.UserRecord {
  return {
    id: 0,
    externalId,
    ...GITHUB,
    login,
    avatarUrl: `a-${login}`,
    url: `https://github.com/${login}`,
  };
}

function seedIssue(repoId: number, number: number, updatedAt: number) {
  mirror.upsertIssue(
    {
      externalId: String(1000 + number),
      repoId,
      number,
      kind: "issue",
      title: `issue ${number}`,
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: `https://github.com/orgA/core/issues/${number}`,
      createdAt: updatedAt,
      updatedAt,
      closedAt: null,
      labels: ["todo"],
      assignees: [],
      comments: [],
    },
    { status: "todo", impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
  );
}

describe("forge-neutral mirror", () => {
  test("upsertRepo returns an internal id and is idempotent", () => {
    const a = mirror.upsertRepo({
      externalId: "7",
      ...GITHUB,
      org: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      archived: false,
    });
    const b = mirror.upsertRepo({
      externalId: "7",
      ...GITHUB,
      org: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      archived: true,
    });
    expect(b.id).toBe(a.id);
    expect(b.archived).toBe(1);
    expect(mirror.getRepoBySlug("github", "github.com", "acme", "widgets")?.id).toBe(
      a.id,
    );
    expect(mirror.getRepo(a.id)?.externalId).toBe("7");
    expect(mirror.getRepoByOrgName("acme", "widgets")?.id).toBe(a.id);
  });

  test("upsertUser is keyed by external id", () => {
    const a = mirror.upsertUser({
      id: 0,
      externalId: "101",
      ...GITHUB,
      login: "octocat",
      avatarUrl: "",
      url: "",
    });
    const b = mirror.upsertUser({
      id: 0,
      externalId: "101",
      ...GITHUB,
      login: "octocat2",
      avatarUrl: "x",
      url: "",
    });
    expect(b.id).toBe(a.id);
    expect(mirror.getUser("101", "github", "github.com")?.login).toBe("octocat2");
  });
});

describe("repo upsert", () => {
  test("creates then updates in place", () => {
    const created = seedRepo();
    expect(created).toMatchObject({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      url: "https://github.com/orgA/core",
    });

    const updated = mirror.upsertRepo({
      externalId: "1",
      ...GITHUB,
      org: "orgA",
      name: "renamed",
      url: "https://github.com/orgA/renamed",
      archived: true,
    });
    expect(updated.name).toBe("renamed");
    expect(updated.url).toBe("https://github.com/orgA/renamed");
    expect(updated.archived).toBe(1);
    expect(mirror.listRepos()).toHaveLength(1);
  });
});

describe("cursor", () => {
  test("is null before backfill and the newest updated_at after", () => {
    const repo = seedRepo();
    expect(mirror.getRepoCursor(repo.id)).toBeNull();
    seedIssue(repo.id, 1, 1000);
    seedIssue(repo.id, 2, 3000);
    seedIssue(repo.id, 3, 2000);
    expect(mirror.getRepoCursor(repo.id)).toBe(3000);
  });
});

describe("issue upsert", () => {
  test("replaces labels and assignees on re-hydration", () => {
    const repo = seedRepo();
    seedIssue(repo.id, 1, 1000);
    expect(mirror.getIssueLabels(repo.id, 1)).toEqual(["todo"]);

    mirror.upsertIssue(
      {
        externalId: "1001",
        repoId: repo.id,
        number: 1,
        kind: "issue",
        title: "issue 1",
        body: "edited",
        state: "open",
        stateReason: null,
        author: null,
        milestoneNumber: null,
        url: "https://github.com/orgA/core/issues/1",
        createdAt: 1000,
        updatedAt: 2000,
        closedAt: null,
        labels: ["in-progress"],
        assignees: [],
        comments: [],
      },
      { status: "in-progress", impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
    );

    const issue = mirror.getIssue(repo.id, 1);
    expect(issue?.body).toBe("edited");
    expect(issue?.status).toBe("in-progress");
    expect(issue?.kind).toBe("issue");
    expect(issue?.externalId).toBe("1001");
    expect(issue?.url).toBe("https://github.com/orgA/core/issues/1");
    expect(mirror.getIssueLabels(repo.id, 1)).toEqual(["in-progress"]);
  });

  test("resolves author, assignee and comment authors to internal user ids", () => {
    const repo = seedRepo();
    const author = user("101", "octocat");
    const assignee = user("202", "dev");
    mirror.upsertIssue(
      {
        externalId: "9001",
        repoId: repo.id,
        number: 1,
        kind: "issue",
        title: "owned",
        body: "",
        state: "open",
        stateReason: null,
        author,
        milestoneNumber: null,
        url: "https://github.com/orgA/core/issues/1",
        createdAt: 1,
        updatedAt: 2,
        closedAt: null,
        labels: [],
        assignees: [assignee],
        comments: [
          {
            externalId: "500",
            author,
            body: "hi",
            createdAt: 3,
            updatedAt: 3,
          },
        ],
      },
      {
        status: null,
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        labelConflict: false,
      },
    );

    const storedAuthor = mirror.getUser("101", "github", "github.com");
    const storedAssignee = mirror.getUser("202", "github", "github.com");
    expect(storedAuthor).toBeDefined();
    expect(storedAssignee).toBeDefined();

    expect(mirror.getIssue(repo.id, 1)?.authorId).toBe(storedAuthor!.id);
    expect(
      db
        .select()
        .from(mirrorThreadAssignee)
        .all()
        .map((row) => row.userId),
    ).toEqual([storedAssignee!.id]);
    expect(db.select().from(mirrorComment).get()).toMatchObject({
      repoId: repo.id,
      threadNumber: 1,
      externalId: "500",
      authorId: storedAuthor!.id,
      body: "hi",
    });
  });
});

describe("comment reconciliation", () => {
  const metadata: mirror.StoredMetadata = {
    status: null,
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
  };
  const record = (
    repoId: number,
    number: number,
    comments: Array<{ externalId: string; body: string }>,
  ): mirror.IssueRecord => ({
    externalId: String(9000 + number),
    repoId,
    number,
    kind: "issue",
    title: `issue ${number}`,
    body: "",
    state: "open",
    stateReason: null,
    author: null,
    milestoneNumber: null,
    url: `https://github.com/orgA/core/issues/${number}`,
    createdAt: 1,
    updatedAt: 2,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: comments.map((c) => ({
      ...c,
      author: null,
      createdAt: 3,
      updatedAt: 4,
    })),
  });

  test("reconciles deleted and edited comments", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );
    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "1", body: "one edited" }]),
      metadata,
    );

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => [c.externalId, c.body]),
    ).toEqual([["1", "one edited"]]);
  });

  test("an empty incoming list clears the thread's comments", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );
    mirror.upsertIssue(record(repo.id, 1, []), metadata);

    expect(mirror.getIssueComments(repo.id, 1)).toEqual([]);
  });

  test("reconciling one issue leaves other issues' comments intact", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );
    mirror.upsertIssue(
      record(repo.id, 2, [{ externalId: "3", body: "three" }]),
      metadata,
    );

    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "1", body: "one" }]),
      metadata,
    );

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => c.externalId),
    ).toEqual(["1"]);
    expect(
      mirror.getIssueComments(repo.id, 2).map((c) => c.externalId),
    ).toEqual(["3"]);
  });

  test("deletes more stale ids than SQLite's bound-variable limit", () => {
    const repo = seedRepo();
    const many = Array.from({ length: 1000 }, (_, i) => ({
      externalId: `c${i + 1}`,
      body: `body ${i + 1}`,
    }));
    mirror.upsertIssue(record(repo.id, 1, many), metadata);
    expect(mirror.getIssueComments(repo.id, 1)).toHaveLength(1000);

    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "c1", body: "kept" }]),
      metadata,
    );

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => c.externalId),
    ).toEqual(["c1"]);
  });

  test("a throw during the upsert rolls back the whole issue", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );

    const broken = record(repo.id, 1, [{ externalId: "1", body: "edited" }]);
    broken.comments.push({
      externalId: null as unknown as string,
      author: null,
      body: "bad",
      createdAt: 3,
      updatedAt: 4,
    });
    expect(() => mirror.upsertIssue(broken, metadata)).toThrow();

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => [c.externalId, c.body]),
    ).toEqual([
      ["1", "one"],
      ["2", "two"],
    ]);
  });
});

describe("pruning", () => {
  test("deleteIssuesNotIn removes only absent rows", () => {
    const repo = seedRepo();
    seedIssue(repo.id, 1, 1000);
    seedIssue(repo.id, 2, 2000);
    seedIssue(repo.id, 3, 3000);

    const removed = mirror.deleteIssuesNotIn(repo.id, [1, 3]);

    expect(removed).toBe(1);
    expect(mirror.getIssue(repo.id, 2)).toBeUndefined();
    expect(mirror.getIssue(repo.id, 1)).toBeDefined();
    expect(mirror.getIssue(repo.id, 3)).toBeDefined();
  });
});

describe("repo labels", () => {
  test("replaces the full set", () => {
    const repo = seedRepo();
    mirror.replaceRepoLabels(repo.id, [
      { name: "bug", color: "ff0000", description: "" },
    ]);
    expect(mirror.getRepoLabels(repo.id)).toEqual([
      { name: "bug", color: "ff0000", description: "" },
    ]);

    mirror.replaceRepoLabels(repo.id, [
      { name: "todo", color: "78a9ff", description: "Status: Todo" },
    ]);
    expect(mirror.getRepoLabels(repo.id)).toEqual([
      { name: "todo", color: "78a9ff", description: "Status: Todo" },
    ]);
  });
});

describe("repo assignees", () => {
  test("upserts users and replaces the full set, sorted by login", () => {
    const repo = seedRepo();
    mirror.replaceRepoAssignees(repo.id, [
      user("42", "zoe"),
      user("41", "amy"),
    ]);
    expect(
      mirror.getRepoAssignees(repo.id).map((u) => [u.externalId, u.login]),
    ).toEqual([
      ["41", "amy"],
      ["42", "zoe"],
    ]);

    mirror.replaceRepoAssignees(repo.id, [user("43", "bob")]);
    expect(
      mirror.getRepoAssignees(repo.id).map((u) => [u.externalId, u.login]),
    ).toEqual([["43", "bob"]]);
  });
});

describe("repo milestones", () => {
  test("upserts the creator and replaces the full set", () => {
    const repo = seedRepo();
    mirror.replaceRepoMilestones(repo.id, [
      {
        number: 1,
        externalId: "10",
        title: "v1",
        description: "",
        state: "open",
        dueOn: 1000,
        openIssues: 2,
        closedIssues: 1,
        creator: user("7", "octocat"),
        createdAt: 1,
        updatedAt: 2,
        closedAt: null,
        url: "https://github.com/orgA/core/milestone/1",
      },
    ]);

    const storedCreator = mirror.getUser("7", "github", "github.com");
    const [milestone] = mirror.getRepoMilestones(repo.id);
    expect(milestone).toMatchObject({
      number: 1,
      externalId: "10",
      title: "v1",
      openIssues: 2,
      closedIssues: 1,
      url: "https://github.com/orgA/core/milestone/1",
      creator: {
        externalId: "7",
        forge: "github",
        instance: "github.com",
        login: "octocat",
        avatarUrl: "a-octocat",
      },
    });
    expect(milestone?.creator?.id).toBe(storedCreator!.id);

    mirror.replaceRepoMilestones(repo.id, []);
    expect(mirror.getRepoMilestones(repo.id)).toEqual([]);
  });
});
