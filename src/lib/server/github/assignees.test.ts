import { describe, expect, test } from "bun:test";
import type { InstallationOctokit } from "./app.server";
import { listRepoAssignees } from "./assignees";

/** A fake installation client serving paged `GET /assignees` responses. */
function fake(pages: unknown[][]): InstallationOctokit {
  return {
    request: async (
      route: string,
      params: Record<string, unknown> = {},
    ) => {
      expect(route).toBe("GET /repos/{owner}/{repo}/assignees");
      expect(params.per_page).toBe(100);
      const page = Number(params.page ?? 1);
      return { data: pages[page - 1] ?? [] };
    },
  } as unknown as InstallationOctokit;
}

function restUser(id: number, login: string) {
  return { id, login, avatar_url: `https://avatars/${login}.png` };
}

/** A full page (100) forces a second request. */
function fullPage(startId: number): ReturnType<typeof restUser>[] {
  return Array.from({ length: 100 }, (_, i) =>
    restUser(startId + i, `user${startId + i}`),
  );
}

describe("listRepoAssignees", () => {
  test("returns mapped users from a single short page", async () => {
    const users = await listRepoAssignees(fake([[restUser(1, "octocat")]]), "o", "r");
    expect(users).toEqual([
      { githubId: 1, login: "octocat", avatarUrl: "https://avatars/octocat.png" },
    ]);
  });

  test("paginates until a short page", async () => {
    const users = await listRepoAssignees(
      fake([fullPage(1), [restUser(101, "last")]]),
      "o",
      "r",
    );
    expect(users).toHaveLength(101);
    expect(users.at(-1)).toEqual({
      githubId: 101,
      login: "last",
      avatarUrl: "https://avatars/last.png",
    });
  });

  test("drops entries missing an id or login", async () => {
    const users = await listRepoAssignees(
      fake([[restUser(1, "ok"), { login: "noid" }, { id: 2 }, restUser(3, "yes")]]),
      "o",
      "r",
    );
    expect(users.map((u) => u.login)).toEqual(["ok", "yes"]);
  });
});
