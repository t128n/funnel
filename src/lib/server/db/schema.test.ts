import { expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
const cols = (table: string) =>
  db.$client
    .query(`pragma table_info(${table})`)
    .all()
    .map((r: any) => r.name);
test("the mirror is forge-neutral", () => {
  const repo = cols("mirror_repo");
  expect(repo).toContain("forge");
  expect(repo).toContain("instance");
  expect(repo).toContain("external_id");
  expect(repo).not.toContain("github_id");
  const thread = cols("mirror_thread");
  expect(thread).toContain("kind");
  expect(thread).toContain("external_id");
  expect(thread).toContain("url");
  expect(cols("mirror_github_repo")).toEqual([]);
});
test("durable state keeps external authors", () => {
  expect(cols("state_work_note")).toContain("author_external_id");
  expect(cols("state_work_note")).not.toContain("author_github_id");
  expect(cols("state_attachment")).toContain("uploaded_by_external_id");
});
