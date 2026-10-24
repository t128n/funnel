/**
 * Guards the planning documentation against drifting away from the feature
 * contract in `docs/plans/2026-10-24-time-planning.spec.md`.
 *
 * The feature is documented before the implementation lands, so these checks
 * assert the durable vocabulary — setting keys, table, routes, API endpoint and
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
  );
}

const settings = read("docs/reference/settings.md");
const schema = read("docs/reference/database-schema.md");
const routes = read("docs/reference/routes-and-pages.md");
const api = read("docs/reference/http-api.md");
const glossary = read("docs/reference/glossary.md");
const workflow = read("docs/explanation/workflow-model.md");
const howTo = read("docs/how-to/configure/planning.md");
const index = read("docs/README.md");

describe("planning documentation", () => {
  test("test_settings_docs_have_all_keys", () => {
    for (const key of [
      "planning.size_minutes",
      "planning.allocation_percent",
      "planning.cycle_weeks",
      "planning.cycle_anchor",
      "planning.maintainers",
    ]) {
      expect(settings).toContain(key);
    }
  });

  test("test_settings_docs_carry_defaults", () => {
    // §1: the size map defaults to 2h/4h/8h minutes, a 60% allocation, a
    // two-week cycle anchored on Monday 2024-01-01 and an empty roster.
    expect(settings).toContain("`{ \"sm\": 120, \"md\": 240, \"lg\": 480 }`");
    expect(settings).toContain("`\"2024-01-01\"`");
    expect(settings).toContain("`1..100`");
    expect(settings).toContain("`1..52`");
  });

  test("test_database_docs_have_state_plan_item", () => {
    expect(schema).toContain("state_plan_item");
    expect(schema).toContain("week_start");
    expect(schema).toContain("idx_state_plan_item_week");
    // The table is durable and keyed without a mirror foreign key.
    expect(schema).toContain("(org, name, issue_number)");
  });

  test("test_routes_docs_name_plan", () => {
    expect(routes).toContain("/plan");
    expect(routes).toContain("/settings/planning");
    // `/plan` is readable by `read`; the settings section is `admin`.
    expect(routes).toContain("| `/plan` |");
    expect(routes).toContain("| `/settings/planning` |");
  });

  test("test_api_docs_name_plan_endpoint", () => {
    const endpoint = "/api/repos/{owner}/{repo}/issues/{number}/plan";
    expect(api).toContain(endpoint);
    expect(api).toContain("`PUT`");
    expect(api).toContain("`DELETE`");
    expect(api).toContain("week_start");
    expect(api).toContain("violations");
  });

  test("test_net_hours_is_defined", () => {
    const term = glossary.toLowerCase();
    expect(term).toContain("**net hours**");
    expect(term).toContain("meetings");
    expect(term).toContain("60%");
  });

  test("test_glossary_has_planning_terms", () => {
    for (const term of ["**Estimate**", "**Net hours**", "**Cycle**", "**Plan item**"]) {
      expect(glossary).toContain(term);
    }
  });

  test("test_net_hours_hint_is_verbatim", () => {
    const hint =
      "Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.";
    expect(howTo).toContain(hint);
  });

  test("test_how_to_covers_estimates_and_schedule", () => {
    expect(howTo).toContain("planning.size_minutes");
    expect(howTo).toContain("weekly_minutes");
    expect(howTo).toContain("409");
  });

  test("test_how_to_is_linked_from_index", () => {
    expect(index).toContain("how-to/configure/planning.md");
  });

  test("test_workflow_model_explains_planning", () => {
    expect(workflow.toLowerCase()).toContain("plan item");
    expect(workflow.toLowerCase()).toContain("capacity");
  });
});
