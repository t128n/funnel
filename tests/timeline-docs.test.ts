import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("milestone timeline documentation", () => {
  test("names the route and the ECharts projection", () => {
    const routes = read("docs/reference/routes-and-pages.md");
    expect(routes).toContain("| `/timeline` |");
    expect(routes).toContain("Apache ECharts");
    expect(routes).toContain("No due date");
  });

  test("documents the read-only Gantt task", () => {
    const howTo = read("docs/how-to/use/milestones.md");
    expect(howTo).toContain("## Read the timeline");
    expect(howTo).toContain("Apache ECharts Gantt");
    expect(howTo).toContain("Planned window");
    expect(howTo).toContain("Closed work");
    expect(howTo).toContain("No start");
    expect(howTo).toContain("read-only");
  });

  test("explains why the timeline is a projection", () => {
    const explanation = read("docs/explanation/planning-and-actuals.md");
    expect(explanation).toContain("## The timeline is a projection");
    expect(explanation).toContain("no per-issue start or end dates");
    expect(explanation).toContain("Apache ECharts");
  });

  test("records the Bootstrap timeline rules", () => {
    const design = read("docs/DESIGN.md");
    expect(design).toContain("ECharts");
    expect(design).toContain("--funnel-chart-*");
    expect(design).toContain("Bootstrap");
    expect(design).toContain("undated");
  });

  test("links the timeline from the indexes and README", () => {
    expect(read("docs/README.md")).toContain(
      "how-to/use/milestones.md#read-the-timeline",
    );
    expect(read("README.md")).toContain("/timeline");
  });

  test("ships both preview screenshots", () => {
    for (const path of [
      "docs/assets/screenshots/timeline-light.png",
      "docs/assets/screenshots/timeline-dark.png",
    ]) {
      expect(statSync(path).size).toBeGreaterThan(1000);
    }
    const gallery = read("docs/assets/screenshots/README.md");
    expect(gallery).toContain("timeline-light.png");
    expect(gallery).toContain("timeline-dark.png");
  });
});
