/**
 * Guards the actuals, delays and epics documentation against drifting away from
 * the feature contract in `docs/plans/2026-10-24-actuals-delays-epics.spec.md`.
 *
 * The feature is documented before the implementation lands, so these checks
 * assert the durable vocabulary — label, tables, routes, API endpoints and
 * glossary terms — rather than any code path. When a documented name changes,
 * the spec must change first and this test follows it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

const reserved = read("docs/reference/reserved-labels.md");
const schema = read("docs/reference/database-schema.md");
const routes = read("docs/reference/routes-and-pages.md");
const api = read("docs/reference/http-api.md");
const glossary = read("docs/reference/glossary.md");
const workflow = read("docs/explanation/workflow-model.md");
const trackTime = read("docs/how-to/use/track-time-and-delays.md");
const epics = read("docs/how-to/use/epics.md");
const index = read("docs/README.md");

describe("actuals, delays and epics documentation", () => {
  test("test_reserved_labels_has_epic", () => {
    // §3: `epic` is the fifteenth canonical label in its own `epic` group.
    expect(reserved).toContain("fifteen");
    expect(reserved).toContain("| `epic` | `epic` |");
    expect(reserved).toContain("`epic` group");
    expect(reserved).not.toContain("fourteen reserved labels");
  });

  test("test_schema_docs", () => {
    // §8: the event log, delay store and cached epic flag are additive.
    expect(schema).toContain("state_issue_event");
    expect(schema).toContain("state_issue_delay");
    expect(schema).toContain("is_epic");
    for (const column of [
      "kind",
      "from_value",
      "to_value",
      "source",
      "org",
      "name",
      "issue_number",
    ]) {
      expect(schema).toContain(`\`${column}\``);
    }
    for (const column of [
      "reason",
      "started_at",
      "ended_at",
      "note",
      "source",
    ]) {
      expect(schema).toContain(`\`${column}\``);
    }
    expect(schema).toContain("never pruned");
  });

  test("test_routes_docs", () => {
    // §6–§7: the epics views, epic mutations and delay endpoints.
    expect(routes).toContain("/epics");
    expect(routes).toContain("/epics/{owner}/{repo}/{number}");
    expect(api).toContain("/api/repos/{owner}/{repo}/issues/{number}/epic");
    expect(api).toContain(
      "/api/repos/{owner}/{repo}/issues/{number}/epic/children",
    );
    expect(api).toContain("/api/repos/{owner}/{repo}/issues/{number}/delays");
    expect(api).toContain(
      "/api/repos/{owner}/{repo}/issues/{number}/delays/{id}",
    );
    expect(api).toContain("`is_epic`");
    expect(api).toContain("`children`");
    expect(index).toContain("how-to/use/track-time-and-delays.md");
    expect(index).toContain("how-to/use/epics.md");
  });

  test("test_glossary", () => {
    // §1–§3: the three nouns the feature introduces.
    for (const term of ["**Actual time**", "**Delay**", "**Epic**"]) {
      expect(glossary).toContain(term);
    }
    expect(glossary).toContain("in-review");
    expect(workflow).toContain("in-review");
  });

  test("test_no_backfill_is_documented", () => {
    // §1 and §9: tracking starts at deployment and is never reconstructed.
    expect(trackTime.toLowerCase()).toContain("deployment");
    expect(trackTime.toLowerCase()).toContain("no historical backfill");
    expect(workflow.toLowerCase()).toContain("no historical backfill");
    // §3: children live in the epic body, not a membership table.
    expect(epics).toContain("funnel_metadata");
    expect(epics).toContain('epic:\n  children:');
    expect(workflow).toContain("funnel_metadata");
  });

  test("test_error_statuses_match_routes", () => {
    // The documented statuses must match the implemented handlers.
    expect(api).toContain("self reference or a nested epic with `400`");
    expect(api).not.toContain("nested epic with `409`");
    expect(api).toContain("automatic blocked row returns `403`");
    expect(api).toContain("`DELETE` returns `404` for a missing row");
    expect(api).not.toContain("idempotent for a missing row");
  });

  test("test_epic_detail_docs_match_surface", () => {
    // The detail page renders the epic header, rollup cards and child table;
    // it does not render the epic issue's own time block.
    expect(epics).toContain("epic issue header");
    expect(epics).not.toContain("its own status and time");
  });
});
