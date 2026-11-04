/**
 * Timeline component contracts.
 *
 * Bun cannot mount a canvas-backed Svelte component without the Vite plugin,
 * so these checks read the source for the wiring that would be invisible in a
 * snapshot: the ECharts registration, the real HTML label links, the single
 * undated rendering path, and the Bootstrap/Funnel token consumption.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const chart = readFileSync(new URL("./TimelineChart.svelte", import.meta.url), "utf8");

describe("timeline chart", () => {
	test("uses Apache ECharts through svelte-echarts", () => {
		expect(chart).toContain("from 'svelte-echarts'");
		expect(chart).toContain("from 'echarts/core'");
		expect(chart).toContain("CustomChart");
		expect(chart).toContain("ScatterChart");
		expect(chart).toContain("CanvasRenderer");
		expect(chart).toContain("<Chart");
		expect(chart).toContain("buildTimelineOptions");
	});

	test("keeps a real HTML label column with milestone links", () => {
		expect(chart).toContain('data-testid="timeline-chart"');
		expect(chart).toContain("data-timeline-row");
		expect(chart).toContain("data-timeline-head");
		expect(chart).toContain("milestonePath(row.repo, row.number)");
		expect(chart).toContain("timelineRef(row.repo, row.number, repoShortcodes)");
		expect(chart).toContain("progressText(row)");
	});

	test("labels the chart and keeps the label column sticky", () => {
		expect(chart).toContain('role="img"');
		expect(chart).toContain("aria-label={`Gantt chart of");
		expect(chart).toContain("position: sticky");
		expect(chart).toContain("var(--funnel-timeline-label)");
		expect(chart).toContain("overflow-x: auto");
	});

	test("lets the tallest label drive every row height so nothing clips", () => {
		expect(chart).toContain("data-timeline-row-content");
		expect(chart).toContain("timelineRowHeight");
		expect(chart).toContain("min-height: var(--funnel-timeline-row)");
		expect(chart).not.toMatch(/^\s*height:\s*var\(--funnel-timeline-row\)/m);
		expect(chart).not.toMatch(/\.timeline-row\s*\{[^}]*overflow:\s*hidden/);
	});

	test("renders the legend in HTML, not in the canvas", () => {
		for (const label of [
			"Planned window",
			"Closed work",
			"Open issues",
			"No start",
			"Today",
		]) {
			expect(chart).toContain(label);
		}
		expect(chart).toContain("timeline-legend-planned");
		expect(chart).toContain("timeline-legend-closed");
		expect(chart).toContain("timeline-legend-marker");
	});

	test("keeps absent dates in one data table", () => {
		expect(chart).toContain('data-testid="timeline-undated"');
		expect(chart).toContain("funnel-table");
		expect(chart).toContain("No due date");
		expect(chart).toContain("Not plotted until a milestone has a due date.");
		expect(chart).toContain("No start");
		expect(chart).toContain("After due");
		expect(chart).toContain("Overdue");
	});

	test("consumes Bootstrap and Funnel tokens and writes no literal colours", () => {
		expect(chart).toContain("--funnel-chart-1");
		expect(chart).toContain("--funnel-chart-2");
		expect(chart).toContain("--funnel-chart-3");
		expect(chart).toContain("--bs-border-color");
		expect(chart).toContain("--bs-secondary-color");
		expect(chart).not.toMatch(/#[0-9a-f]{3,8}\b/i);
	});

	test("stays read-only: no drag handlers", () => {
		expect(chart).not.toContain("ondrag");
		expect(chart).not.toContain("draggable");
	});
});
