import { describe, expect, test } from "bun:test";
import {
  emptySearchQuery,
  ftsMatchExpression,
  hasSearchConstraints,
  parseSearchQuery,
  type SearchContext,
} from "./search";

const ctx: SearchContext = {
  repos: [
    { id: 1, org: "orgA", name: "core" },
    { id: 2, org: "orgA", name: "web" },
  ],
  shortcodes: { "orgA/core": "FIT" },
  viewerExternalId: "42",
  resolveLogin: (login) => (login === "octocat" ? "7" : undefined),
};

describe("parseSearchQuery", () => {
  test("keeps plain words as free text", () => {
    const query = parseSearchQuery("crash on boot", ctx);
    expect(query.text).toBe("crash on boot");
    expect(query.identifiers).toEqual([]);
    expect(hasSearchConstraints(query)).toBe(false);
  });

  test("parses #number, shortcode and owner/repo identifiers", () => {
    expect(parseSearchQuery("#123", ctx).identifiers).toEqual([
      { repoId: null, number: 123 },
    ]);
    expect(parseSearchQuery("FIT-12", ctx).identifiers).toEqual([
      { repoId: 1, number: 12 },
    ]);
    // Shortcode lookup is case-insensitive.
    expect(parseSearchQuery("fit-12", ctx).identifiers).toEqual([
      { repoId: 1, number: 12 },
    ]);
    expect(parseSearchQuery("orgA/web#7", ctx).identifiers).toEqual([
      { repoId: 2, number: 7 },
    ]);
  });

  test("derives a shortcode when settings do not define one", () => {
    expect(parseSearchQuery("WEB-7", ctx).identifiers).toEqual([
      { repoId: 2, number: 7 },
    ]);
  });

  test("an unknown shortcode stays text, an unknown repo is impossible", () => {
    const unknownShortcode = parseSearchQuery("NOPE-7", ctx);
    expect(unknownShortcode.text).toBe("NOPE-7");
    expect(unknownShortcode.identifiers).toEqual([]);
    expect(unknownShortcode.impossible).toBe(false);

    const unknownRepo = parseSearchQuery("orgA/ghost#7", ctx);
    expect(unknownRepo.impossible).toBe(true);
  });

  test("removes identifiers and qualifiers from the free text", () => {
    const query = parseSearchQuery("#12 label:bug gamma", ctx);
    expect(query.text).toBe("gamma");
    expect(query.identifiers).toEqual([{ repoId: null, number: 12 }]);
    expect(query.labels).toEqual(["bug"]);
  });

  test("parses each supported qualifier", () => {
    const query = parseSearchQuery(
      "is:unassigned is:blocked label:bug repo:orgA/web status:todo assignee:octocat",
      ctx,
    );
    expect(query.unassigned).toBe(true);
    expect(query.blocked).toBe(true);
    expect(query.labels).toEqual(["bug"]);
    expect(query.repos).toEqual([2]);
    expect(query.statuses).toEqual(["todo"]);
    expect(query.assignees).toEqual(["7"]);
  });

  test("supports quoted qualifier values", () => {
    const query = parseSearchQuery('label:"needs review"', ctx);
    expect(query.labels).toEqual(["needs review"]);
  });

  test("resolves assignee me and none", () => {
    expect(parseSearchQuery("assignee:me", ctx).assignees).toEqual(["42"]);
    expect(parseSearchQuery("assignee:none", ctx).unassigned).toBe(true);
  });

  test("marks bad qualifier values impossible instead of broadening", () => {
    expect(parseSearchQuery("status:bogus", ctx).impossible).toBe(true);
    expect(parseSearchQuery("repo:orgA/ghost", ctx).impossible).toBe(true);
    expect(parseSearchQuery("assignee:ghost", ctx).impossible).toBe(true);
    expect(parseSearchQuery("is:banana", ctx).impossible).toBe(true);
    expect(parseSearchQuery("label:", ctx).impossible).toBe(true);
  });

  test("leaves unknown key:value tokens in the text", () => {
    expect(parseSearchQuery("https://example.com", ctx).text).toBe(
      "https://example.com",
    );
    expect(parseSearchQuery("http://example.com", ctx).impossible).toBe(false);
  });

  test("punctuation-only text cannot match", () => {
    const query = parseSearchQuery("%", ctx);
    expect(query.text).toBe("");
    expect(query.impossible).toBe(true);
  });

  test("empty input produces an empty query", () => {
    expect(parseSearchQuery("  ", ctx)).toEqual(emptySearchQuery());
  });
});

describe("ftsMatchExpression", () => {
  test("quotes every term and prefix-matches it", () => {
    expect(ftsMatchExpression("gamma crash")).toBe('"gamma"* AND "crash"*');
  });

  test("neutralises FTS operators and punctuation", () => {
    expect(ftsMatchExpression("foo:* OR bar")).toBe(
      '"foo"* AND "OR"* AND "bar"*',
    );
    expect(ftsMatchExpression("100%_done")).toBe('"100"* AND "_done"*');
  });

  test("returns null when there is no indexable term", () => {
    expect(ftsMatchExpression("%%%")).toBeNull();
    expect(ftsMatchExpression("   ")).toBeNull();
  });
});
