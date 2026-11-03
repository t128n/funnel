import { expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";

const pages = {
  tutorial: "docs/tutorials/plan-and-track-a-cycle.md",
  howTo: "docs/how-to/use/plan-work.md",
  reference: "docs/reference/planning-and-time.md",
  explanation: "docs/explanation/planning-and-actuals.md",
};

const screenshots = [
  "docs/assets/screenshots/plan-week.png",
  "docs/assets/screenshots/plan-cycle.png",
  "docs/assets/screenshots/settings-planning.png",
  "docs/assets/screenshots/epics-list.png",
  "docs/assets/screenshots/epic-detail.png",
  "docs/assets/screenshots/inspector-time.png",
  "docs/assets/screenshots/inspector-blocked.png",
];

test("time planning docs cover all four Diataxis modes", () => {
  for (const path of Object.values(pages)) {
    const text = readFileSync(path, "utf8");
    expect(text.length).toBeGreaterThan(1000);
  }
  const readme = readFileSync("docs/README.md", "utf8");
  for (const path of Object.values(pages)) {
    expect(readme).toContain(path.replace("docs/", ""));
  }
});

test("the new pages keep their mode boundaries", () => {
  const tutorial = readFileSync(pages.tutorial, "utf8");
  expect(tutorial).toContain("## 1.");
  expect(tutorial).toContain("What you have built");

  const howTo = readFileSync(pages.howTo, "utf8");
  expect(howTo).toContain("This guide shows you how to");
  expect(howTo).not.toContain("In this tutorial");

  const reference = readFileSync(pages.reference, "utf8");
  expect(reference).toContain("| Key | Type | Default |");
  expect(reference).not.toContain("This guide shows you how to");

  const explanation = readFileSync(pages.explanation, "utf8");
  expect(explanation).toContain("## Three layers of state");
  expect(explanation).toContain("## What this design optimises");
});

test("the screenshots exist and are embedded", () => {
  for (const path of screenshots) {
    expect(statSync(path).size).toBeGreaterThan(1000);
  }
  const tutorial = readFileSync(pages.tutorial, "utf8");
  expect(tutorial).toContain("../assets/screenshots/settings-planning.png");
  expect(tutorial).toContain("../assets/screenshots/plan-week.png");
  expect(tutorial).toContain("../assets/screenshots/epic-detail.png");
  const inspector = readFileSync("docs/how-to/use/track-time-and-delays.md", "utf8");
  expect(inspector).toContain("../../assets/screenshots/inspector-blocked.png");
});

test("the design language documents the Bootstrap foundation", () => {
  const gallery = readFileSync("docs/explanation/design-language.md", "utf8");
  expect(gallery).toContain("Bootstrap 5");
  expect(gallery).toContain("Sveltestrap");
  expect(gallery).toContain("Bootstrap Icons");
  expect(gallery).toContain("data-bs-theme");
});
