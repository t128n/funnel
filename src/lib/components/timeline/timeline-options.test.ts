import { describe, expect, test } from "bun:test";
import type { TimelineRow, TimelineWindow } from "#lib/timeline";
import { buildTimelineOptions, type TimelineChartTokens } from "./timeline-options";

const TOKENS: TimelineChartTokens = {
  fontSans: "Geist Sans",
  fontMono: "Geist Mono",
  captionPx: 12,
  bodyPx: 14,
  monoPx: 13,
  chart1: "#0f62fe",
  chart2: "#0e6027",
  chart3: "#ee5396",
  borderSubtle: "#dde1e6",
  borderStrong: "#7a7a7a",
  textPrimary: "#161616",
  textSecondary: "#525252",
  textMuted: "#6f6f6f",
  surface: "#f2f4f8",
  warning: "#8a5a00",
};

const WINDOW: TimelineWindow = {
  start: Date.UTC(2026, 9, 19),
  end: Date.UTC(2026, 11, 28),
};
const NOW = Date.UTC(2026, 10, 2);

function row(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    repo: "acme/widgets",
    number: 1,
    title: "v1",
    dueOn: Date.UTC(2026, 10, 23),
    startOn: Date.UTC(2026, 9, 27),
    startSource: "plan",
    openIssues: 8,
    closedIssues: 2,
    progress: 0.2,
    markers: [],
    ...overrides,
  };
}

function options(rows: TimelineRow[], reduce = false) {
  return buildTimelineOptions({
    rows,
    window: WINDOW,
    now: NOW,
    rowHeight: 44,
    headerHeight: 32,
    tokens: TOKENS,
    reducedMotion: reduce,
  });
}

type Series = Record<string, unknown> & { data?: unknown[]; renderItem?: Function };

function seriesOf(option: ReturnType<typeof options>): Series[] {
  return option.series as unknown as Series[];
}

describe("timeline ECharts options", () => {
  test("maps one category and one planned window per dated row", () => {
    const option = options([row(), row({ number: 2, startOn: null })]);
    const series = seriesOf(option);

    expect((option.yAxis as { data: string[] }).data).toEqual(["0", "1"]);
    expect((option.yAxis as { inverse: boolean }).inverse).toBe(true);
    expect((option.grid as { top: number }).top).toBe(32);
    expect(series.find((item) => item.name === "Planned window")?.data).toHaveLength(1);
  });

  test("a no-start or after-due milestone never gets a planned window", () => {
    const option = options([
      row({ number: 1, startOn: null }),
      row({ number: 2, startOn: Date.UTC(2026, 11, 1), dueOn: Date.UTC(2026, 10, 1) }),
    ]);
    const series = seriesOf(option);

    expect(series.find((item) => item.name === "Planned window")?.data).toEqual([]);
    expect(series.find((item) => item.name === "Due, no start")?.data).toHaveLength(1);
    expect(series.find((item) => item.name === "After due")?.data).toHaveLength(1);
  });

  test("closed work ends at the progress fraction, not the due date", () => {
    const option = options([row({ progress: 0.5 })]);
    const closed = seriesOf(option).find((item) => item.name === "Closed work");
    const datum = closed?.data?.[0] as { value: [number, number, number] };

    expect(datum.value[0]).toBe(Date.UTC(2026, 9, 27));
    expect(datum.value[1]).toBe(
      Date.UTC(2026, 9, 27) +
        (Date.UTC(2026, 10, 23) - Date.UTC(2026, 9, 27)) * 0.5,
    );
  });

  test("progress zero emits no closed-work bar", () => {
    const option = options([row({ progress: 0 })]);
    expect(
      seriesOf(option).find((item) => item.name === "Closed work")?.data,
    ).toEqual([]);
  });

  test("markers are scatter points on the row's category", () => {
    const option = options([
      row({
        markers: [
          {
            repo: "acme/widgets",
            number: 3,
            title: "Child",
            status: "in-progress",
            priority: "P1",
            blocked: false,
            at: Date.UTC(2026, 10, 1),
            source: "active",
          },
        ],
      }),
    ]);
    const markers = seriesOf(option).find((item) => item.name === "Open issues");
    const datum = markers?.data?.[0] as { value: [number, number] };

    expect(datum.value).toEqual([Date.UTC(2026, 10, 1), 0]);
  });

  test("draws the planned window with chart-1 at 18% and closed work with chart-2", () => {
    const series = seriesOf(options([row()]));
    const planned = series.find((item) => item.name === "Planned window");
    const closed = series.find((item) => item.name === "Closed work");
    const api = {
      value: (dimension: number) =>
        dimension === 0
          ? Date.UTC(2026, 9, 27)
          : dimension === 1
            ? Date.UTC(2026, 10, 23)
            : 0,
      coord: (value: [number, number]) => [value[0] / 1e10, value[1] * 10],
    };

    const plannedRect = planned?.renderItem?.({}, api);
    const closedRect = closed?.renderItem?.({}, api);

    expect(plannedRect.style.stroke).toBe(TOKENS.chart1);
    expect(plannedRect.style.opacity).toBe(0.18);
    expect(closedRect.style.fill).toBe(TOKENS.chart2);
  });

  test("uses a neutral today line and honours reduced motion", () => {
    const option = options([row()], true);
    const today = seriesOf(option).find((item) => item.name === "Today");
    const api = {
      value: () => NOW,
      coord: (value: [number, number]) => [value[0] / 1e10, value[1] * 10],
    };

    expect(option.animation).toBe(false);
    expect(today?.renderItem?.({}, api).style.stroke).toBe(TOKENS.borderStrong);
    expect((option.tooltip as { confine: boolean }).confine).toBe(true);
  });

  test("formats the tooltip from row data and escapes the title", () => {
    const option = options([row({ title: "<b>v1</b>" })]);
    const formatter = (option.tooltip as { formatter: (params: unknown) => string }).formatter;
    const html = formatter({
      seriesName: "Planned window",
      data: {
        title: "<b>v1</b>",
        repo: "acme/widgets",
        number: 1,
        startOn: Date.UTC(2026, 9, 27),
        dueOn: Date.UTC(2026, 10, 23),
        openIssues: 8,
        closedIssues: 2,
        progress: 0.2,
      },
    });

    expect(html).toContain("&lt;b&gt;v1&lt;/b&gt;");
    expect(html).toContain("2/10 closed");
    expect(html).not.toContain("<b>v1</b>");
  });

  test("backs the x-axis with the projection window", () => {
    const option = options([row()]);
    const axis = option.xAxis as {
      min: number;
      max: number;
      position: string;
      axisLabel: { showMinLabel: boolean; showMaxLabel: boolean };
    };

    expect(axis.min).toBe(WINDOW.start);
    expect(axis.max).toBe(WINDOW.end);
    expect(axis.position).toBe("top");
    expect(axis.axisLabel.showMinLabel).toBe(true);
    expect(axis.axisLabel.showMaxLabel).toBe(false);
  });
});
