/**
 * Attention-rule UI wiring (issue #37). The arithmetic and queries have their
 * own tests; this file pins the labels, empty state and disable help text the
 * pages must render.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(relative: string): string {
  return readFileSync(
    new URL(`../${relative}`, import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

describe("attention page", () => {
  const page = source("src/routes/(app)/attention/+page.svelte");
  const server = source("src/routes/(app)/attention/+page.server.ts");
  const layout = source("src/routes/(app)/+layout.server.ts");

  test("renders a labelled rule-breach section grouped by rule", () => {
    expect(page).toContain("Rule breaches");
    expect(page).toContain("ATTENTION_RULES");
    expect(page).toContain("ATTENTION_RULE_LABELS");
    expect(page).toContain("<BreachRow");
    expect(page).toContain("data.breaches");
  });

  test("evaluates breaches in the page load, not the shared layout", () => {
    expect(server).toContain("attentionBreaches");
    expect(server).toContain("breaches:");
    expect(layout).not.toContain("attentionBreaches");
    expect(layout).not.toContain("breaches,");
  });

  test("keeps the existing empty state and blocked/waiting sections", () => {
    expect(page).toContain("Nothing needs attention.");
    expect(page).toContain("Waiting on others");
    expect(page).toContain("classifyAttention");
    expect(page).toContain("data.attention");
  });

  test("documents the UTC vs browser-local clock split", () => {
    expect(page).toContain("server UTC dates");
    expect(page).toContain("browser's timezone");
  });

  test("shows the rule, overdue count and assignees on a breach row", () => {
    const row = source("src/lib/components/attention/BreachRow.svelte");
    expect(row).toContain("ATTENTION_RULE_LABELS");
    expect(row).toContain("daysOverdue");
    expect(row).toContain("assigneeText");
    expect(row).toContain("issuePath('issues'");
  });
});

describe("attention settings page", () => {
  const page = source("src/routes/(app)/settings/attention/+page.svelte");
  const text = page.replace(/\s+/g, " ");
  const server = source("src/routes/(app)/settings/attention/+page.server.ts");
  const sections = source("src/lib/components/settings/sections.ts");

  test("exposes all four thresholds as number inputs with zero disables", () => {
    for (const id of [
      "attention-first-response-days",
      "attention-stale-open-days",
      "attention-recheck-cadence-days",
      "attention-waiting-days",
    ]) {
      expect(page).toContain(id);
    }
    expect(page.match(/type="number"/g)?.length).toBe(4);
    expect(page.match(/min="0"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(text.match(/0 disables the rule/g)?.length).toBe(4);
  });

  test("loads and saves the attention section through the shared action", () => {
    expect(server).toContain("config.attention");
    expect(server).toContain("saveSettingsAction");
    expect(page).toContain("JSON.stringify({\n\t\t\tattention:");
  });

  test("is listed as an admin-only workspace section", () => {
    expect(sections).toContain("id: 'attention'");
    expect(sections).toContain("href: '/settings/attention'");
    expect(sections).toContain("minRole: 'admin'");
  });
});

describe("notification center", () => {
  test("labels the sla kind as an attention rule", () => {
    const page = source("src/routes/(app)/notifications/+page.svelte");
    expect(page).toContain("sla: { label: 'Attention rule'");
    expect(page).toContain("bi-exclamation-octagon");
  });
});
