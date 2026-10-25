/**
 * Guards the ALPEN day-planning documentation against drifting away from the
 * feature contract in `docs/plans/2026-10-25-alpen-day-planning.spec.md`.
 *
 * The feature is documented before the implementation lands, so these checks
 * assert the durable vocabulary — setting key and default, tables, routes,
 * endpoints, glossary terms and the how-to's procedures — rather than any code
 * path. When a documented name changes, the spec must change first and this
 * test follows it.
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
const configure = read("docs/how-to/configure/planning.md");
const howTo = read("docs/how-to/plan/plan-your-day.md");
const index = read("docs/README.md");

describe("ALPEN day-planning documentation", () => {
  test("test_settings", () => {
    expect(settings).toContain("planning.work_defaults");
    // §4: the exact default object, used as the fallback for every viewer
    // without a stored row and as the prefill for `/settings/availability`.
    expect(settings).toContain(
      '`{ "timezone": "UTC", "start_minute": 540, "end_minute": 1020, "work_days": [1,2,3,4,5], "buffer_percent": 20 }`',
    );
    expect(settings).toContain("`0..90`");
  });

  test("test_schema", () => {
    for (const table of [
      "state_work_hours",
      "state_unavailable_window",
      "state_day_block",
      "state_calendar_feed",
    ]) {
      expect(schema).toContain(table);
    }
    // All four are durable per-user rows and cascade with the account.
    expect(schema).toContain("idx_state_day_block_user_date");
    expect(schema).toContain("token_hash");
    expect(schema).toContain("exactly one of");
  });

  test("test_routes", () => {
    expect(routes).toContain("| `/settings/availability` |");
    expect(routes).toContain("| `/plan` |");
    // The day horizon is a fourth `/plan` horizon selected by `horizon=day`.
    expect(routes).toContain("horizon=day");
    expect(routes).toContain("day");
  });

  test("test_api", () => {
    for (const endpoint of [
      "`PUT` | `/api/me/availability`",
      "`POST` | `/api/me/calendar-feed`",
      "`DELETE` | `/api/me/calendar-feed`",
      "`PUT` | `/api/me/day-plan`",
      "`POST` | `/api/me/day-plan/auto`",
    ]) {
      expect(api).toContain(endpoint);
    }
    // The public feed carries the token in the path and needs no session.
    expect(api).toContain("| `GET` | `/api/calendar/{token}.ics`");
    // The raw token is returned once; only its hash and hint are stored.
    expect(api).toContain("shown once");
    expect(api).toContain("token_hash");
  });

  test("test_glossary", () => {
    for (const term of [
      "**ALPEN**",
      "**Working hours**",
      "**Buffer**",
      "**Day plan**",
      "**Calendar feed**",
    ]) {
      expect(glossary).toContain(term);
    }
  });

  test("test_how_to", () => {
    expect(howTo).toContain("Outlook");
    expect(howTo).toContain("subscribe");
    expect(howTo).toContain("Revoke");
    expect(howTo).toContain("regenerate");
    expect(howTo).toContain("daylight saving");
    expect(howTo).toContain("overrun");
    // The how-to is linked from the existing planning guide and the index.
    expect(configure).toContain("plan-your-day.md");
  });

  test("test_index", () => {
    expect(index).toContain("how-to/plan/plan-your-day.md");
  });

  test("test_workflow_model_explains_alpen", () => {
    expect(workflow).toContain("ALPEN");
    expect(workflow).toContain("state_day_block");
    expect(workflow).toContain("calendar feed");
  });
});
