/**
 * Regression guards for the settings feedback surface.
 *
 * Sveltestrap's radio ignores a `checked` prop, so the appearance page must use
 * the component's `group` binding. The layout must guard both the desktop links
 * and the mobile section switcher through the shared dirty store, and the form
 * must render one role="alert" summary with field-level descriptions.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isDirty } from "#lib/components/settings/settings-dirty";

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

describe("settings dirty tracking", () => {
  test("compares the current payload with the saved baseline", () => {
    expect(isDirty('{"session":{"idle_days":30}}', '{"session":{"idle_days":30}}')).toBe(
      false
    );
    expect(isDirty('{"session":{"idle_days":30}}', '{"session":{"idle_days":45}}')).toBe(
      true
    );
  });

  test("the form publishes dirty state and shows a visible marker", () => {
    const form = source("src/lib/components/settings/settings-form.svelte");

    expect(form).toContain("settingsDirty.set(dirty)");
    expect(form).toContain("Unsaved changes");
    expect(form).toContain("data-settings-dirty={dirty}");
  });
});

describe("settings navigation guard", () => {
  const layout = source("src/routes/(app)/settings/+layout.svelte");

  test("guards in-app navigation with the shared dirty store", () => {
    expect(layout).toContain("beforeNavigate");
    expect(layout).toContain("get(settingsDirty)");
    expect(layout).toContain("window.confirm");
    expect(layout).toContain("beforeunload");
  });

  test("the mobile section switcher is subject to the same guard", () => {
    expect(layout).toContain("function navigateTo");
    expect(layout).toContain("void goto(href)");
    expect(layout).toContain("target.value = current");
    expect(layout).toContain("target.value = current;\n\t\t}, 0)");
  });
});

describe("settings validation summary", () => {
  const form = source("src/lib/components/settings/settings-form.svelte");

  test("keeps one alert and moves focus to it after a failed save", () => {
    expect(form).toContain('role="alert"');
    expect(form).toContain("summaryEl.focus");
    expect(form).toContain("summaryEl.scrollIntoView");
    expect(form).toContain("SETTINGS_FAILURE_SUMMARY");
  });

  test("marks the mapped fields and links them to their messages", () => {
    expect(form).toContain("is-invalid");
    expect(form).toContain("aria-invalid");
    expect(form).toContain("aria-describedby");
    expect(form).toContain("issue.id");
  });
});

describe("appearance theme radios", () => {
  const appearance = source("src/routes/(app)/settings/appearance/+page.svelte");

  test("bind the radio group instead of passing a checked prop", () => {
    expect(appearance).toContain("bind:group={choice}");
    expect(appearance).not.toContain("checked={choice === option.value}");
  });

  test("keeps the local choice synchronized with the theme store", () => {
    expect(appearance).toContain("themeChoice.subscribe");
  });
});
