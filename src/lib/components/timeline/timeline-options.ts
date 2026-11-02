/**
 * Apache ECharts option builder for the milestone Gantt.
 *
 * The chart is a projection, not a scheduler: every bar is a milestone's
 * derived window (`startOn` → `dueOn`), the inner bar is the closed fraction,
 * the ticks are open child issues, and the neutral markers are due dates with
 * no start signal. The builder is pure and takes its colours, type and row
 * metrics from the active t128n tokens so the canvas and the HTML label column
 * stay in one design system.
 */
import type {
  CustomSeriesOption,
  CustomSeriesRenderItem,
  EChartsOption,
  ScatterSeriesOption,
} from "echarts";
import type { TimelineRow, TimelineWindow } from "#lib/timeline";
import {
  escapeHtml,
  formatAxisMonth,
  formatAxisMonthYear,
  formatDay,
  formatPercent,
  progressText,
  timelineRef,
} from "./timeline-format";

/** Colours, fonts and sizes read from the active t128n tokens. */
export interface TimelineChartTokens {
  fontSans: string;
  fontMono: string;
  captionPx: number;
  bodyPx: number;
  monoPx: number;
  chart1: string;
  chart2: string;
  chart3: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  surface: string;
  warning: string;
}

export interface TimelineOptionsInput {
  rows: readonly TimelineRow[];
  window: TimelineWindow;
  now: number;
  /** Measured height of one HTML label row, in CSS pixels. */
  rowHeight: number;
  /** Measured height of the axis/label header, in CSS pixels. */
  headerHeight: number;
  tokens: TimelineChartTokens;
  repoShortcodes?: Readonly<Record<string, string>>;
  reducedMotion?: boolean;
}

interface WindowDatum {
  value: [number, number, number];
  rowKey: string;
  repo: string;
  number: number;
  title: string;
  startOn: number;
  dueOn: number;
  openIssues: number;
  closedIssues: number;
  progress: number;
}

interface MarkerDatum {
  value: [number, number];
  rowKey: string;
  repo: string;
  number: number;
  title: string;
  at: number;
  source: "plan" | "active";
  status: string | null;
  blocked: boolean;
}

interface DueDatum {
  value: [number, number];
  rowKey: string;
  repo: string;
  number: number;
  title: string;
  startOn: number | null;
  dueOn: number;
  openIssues: number;
  closedIssues: number;
  progress: number;
}

interface TodayDatum {
  value: [number];
  date: number;
}

/** `owner/name#number`, the stable row identity. */
function rowKey(row: TimelineRow): string {
  return `${row.repo}#${row.number}`;
}

function windowData(row: TimelineRow, index: number): WindowDatum | null {
  if (row.dueOn === null || row.startOn === null || row.startOn > row.dueOn) {
    return null;
  }
  return {
    value: [row.startOn, row.dueOn, index],
    rowKey: rowKey(row),
    repo: row.repo,
    number: row.number,
    title: row.title,
    startOn: row.startOn,
    dueOn: row.dueOn,
    openIssues: row.openIssues,
    closedIssues: row.closedIssues,
    progress: row.progress,
  };
}

function closedData(row: TimelineRow, index: number): WindowDatum | null {
  if (row.dueOn === null || row.startOn === null || row.startOn >= row.dueOn) {
    return null;
  }
  const progress = Math.min(1, Math.max(0, row.progress));
  if (progress <= 0) return null;
  const end = row.startOn + (row.dueOn - row.startOn) * progress;
  return {
    value: [row.startOn, end, index],
    rowKey: rowKey(row),
    repo: row.repo,
    number: row.number,
    title: row.title,
    startOn: row.startOn,
    dueOn: row.dueOn,
    openIssues: row.openIssues,
    closedIssues: row.closedIssues,
    progress,
  };
}

function markerData(row: TimelineRow, index: number): MarkerDatum[] {
  return row.markers.map((marker) => ({
    value: [marker.at, index],
    rowKey: rowKey(row),
    repo: row.repo,
    number: row.number,
    title: marker.title,
    at: marker.at,
    source: marker.source,
    status: marker.status,
    blocked: marker.blocked,
  }));
}

function dueData(row: TimelineRow, index: number): DueDatum | null {
  if (row.dueOn === null) return null;
  return {
    value: [row.dueOn, index],
    rowKey: rowKey(row),
    repo: row.repo,
    number: row.number,
    title: row.title,
    startOn: row.startOn,
    dueOn: row.dueOn,
    openIssues: row.openIssues,
    closedIssues: row.closedIssues,
    progress: row.progress,
  };
}

function tooltipOf(params: unknown, tokens: TimelineChartTokens, shortcodes: Readonly<Record<string, string>>): string {
  const first = (Array.isArray(params) ? params[0] : params) as
    | { seriesName?: string; data?: Record<string, unknown> }
    | undefined;
  const data = first?.data;
  if (data === undefined) return "";

  const title = escapeHtml(String(data.title ?? "Untitled milestone"));
  const ref = escapeHtml(
    timelineRef(String(data.repo ?? ""), Number(data.number ?? 0), shortcodes),
  );
  const line = (text: string, strong = false) =>
    `<div style="font:${strong ? "600 " : ""}${strong ? tokens.bodyPx : tokens.captionPx}px ${tokens.fontSans};color:${strong ? tokens.textPrimary : tokens.textSecondary};${strong ? "margin-bottom:2px" : ""}">${text}</div>`;

  switch (first?.seriesName) {
    case "Planned window": {
      const start = Number(data.startOn);
      const due = Number(data.dueOn);
      const progress = Number(data.progress);
      return [
        line(title, true),
        line(`${ref} · ${formatDay(start)} → ${formatDay(due)}`),
        line(`${String(data.closedIssues)}/${Number(data.closedIssues) + Number(data.openIssues)} closed · ${formatPercent(progress)}`),
      ].join("");
    }
    case "Closed work": {
      return [
        line(title, true),
        line(`${ref} · ${formatPercent(Number(data.progress))} complete`),
        line(`${String(data.closedIssues)}/${Number(data.closedIssues) + Number(data.openIssues)} closed`),
      ].join("");
    }
    case "Open issues": {
      const source = data.source === "plan" ? "Planned" : "Active";
      const blocked = data.blocked === true ? " · Blocked" : "";
      return [
        line(title, true),
        line(`${ref} · ${source} ${formatDay(Number(data.at))}${blocked}`),
      ].join("");
    }
    case "Due, no start": {
      return [
        line(title, true),
        line(`${ref} · due ${formatDay(Number(data.dueOn))}`),
        line("No planned week or active transition yet."),
      ].join("");
    }
    case "After due": {
      return [
        line(title, true),
        line(`${ref} · starts ${formatDay(Number(data.startOn))}`),
        line(`After the ${formatDay(Number(data.dueOn))} due date.`),
      ].join("");
    }
    default:
      return line(title, true);
  }
}

/**
 * Build the complete option tree. The caller owns the container height
 * (`headerHeight + rows * rowHeight`) and the HTML label column; the option
 * only positions the canvas bands to match those measured rows.
 */
export function buildTimelineOptions(input: TimelineOptionsInput): EChartsOption {
  const {
    rows,
    window,
    now,
    rowHeight,
    headerHeight,
    tokens,
    repoShortcodes = {},
    reducedMotion = false,
  } = input;

  const dated = rows.filter((row) => row.dueOn !== null);
  const categories = dated.map((row, index) => `${index}`);
  const barHeight = Math.max(6, Math.min(12, rowHeight * 0.18));
  const markerHeight = Math.max(8, Math.min(14, rowHeight * 0.28));

  const planned: WindowDatum[] = [];
  const closed: WindowDatum[] = [];
  const markers: MarkerDatum[] = [];
  const noStart: DueDatum[] = [];
  const afterDue: DueDatum[] = [];

  dated.forEach((row, index) => {
    const windowDatum = windowData(row, index);
    if (windowDatum !== null) planned.push(windowDatum);
    const closedDatum = closedData(row, index);
    if (closedDatum !== null) closed.push(closedDatum);
    markers.push(...markerData(row, index));

    const due = dueData(row, index);
    if (due === null) return;
    if (row.startOn === null) noStart.push(due);
    else if (row.dueOn !== null && row.startOn > row.dueOn) afterDue.push(due);
  });

  const windowRenderer: CustomSeriesRenderItem = (_params, api) => {
    const row = Number(api.value(2));
    const [startX, centerY] = api.coord([Number(api.value(0)), row]) as [number, number];
    const [endX] = api.coord([Number(api.value(1)), row]) as [number, number];
    const height = Math.max(4, barHeight * 0.58);
    return {
      type: "rect",
      shape: {
        x: startX,
        y: centerY - height / 2,
        width: Math.max(2, endX - startX),
        height,
      },
      style: {
        fill: tokens.chart2,
        stroke: tokens.chart2,
        lineWidth: 1,
      },
    };
  };

  const plannedRenderer: CustomSeriesRenderItem = (_params, api) => {
    const row = Number(api.value(2));
    const [startX, centerY] = api.coord([Number(api.value(0)), row]) as [number, number];
    const [endX] = api.coord([Number(api.value(1)), row]) as [number, number];
    return {
      type: "rect",
      shape: {
        x: startX,
        y: centerY - barHeight / 2,
        width: Math.max(2, endX - startX),
        height: barHeight,
      },
      style: {
        fill: tokens.chart1,
        opacity: 0.18,
        stroke: tokens.chart1,
        lineWidth: 1,
      },
    };
  };

  const todayRenderer: CustomSeriesRenderItem = (_params, api) => {
    const [x, top] = api.coord([Number(api.value(0)), 0]) as [number, number];
    const [, bottom] = api.coord([Number(api.value(0)), categories.length - 1]) as [number, number];
    return {
      type: "line",
      shape: {
        x1: x,
        y1: top - rowHeight / 2,
        x2: x,
        y2: bottom + rowHeight / 2,
      },
      style: {
        stroke: tokens.borderStrong,
        lineWidth: 1,
      },
    };
  };

  const series: Array<CustomSeriesOption | ScatterSeriesOption> = [
    {
      type: "custom",
      name: "Today",
      silent: true,
      z: 1,
      clip: true,
      data: [{ value: [now], date: now } satisfies TodayDatum],
      renderItem: todayRenderer,
      encode: { x: 0 },
    },
    {
      type: "custom",
      name: "Planned window",
      z: 2,
      clip: true,
      data: planned,
      renderItem: plannedRenderer,
      encode: { x: [0, 1], y: 2 },
    },
    {
      type: "custom",
      name: "Closed work",
      z: 3,
      clip: true,
      data: closed,
      renderItem: windowRenderer,
      encode: { x: [0, 1], y: 2 },
    },
    {
      type: "scatter",
      name: "Open issues",
      z: 4,
      clip: true,
      data: markers,
      symbol: "rect",
      symbolSize: [1, markerHeight],
      itemStyle: { color: tokens.chart3 },
      encode: { x: 0, y: 1 },
    },
    {
      type: "scatter",
      name: "Due, no start",
      z: 4,
      clip: true,
      data: noStart,
      symbol: "rect",
      symbolSize: [2, markerHeight],
      itemStyle: { color: tokens.textMuted },
      encode: { x: 0, y: 1 },
    },
    {
      type: "scatter",
      name: "After due",
      z: 4,
      clip: true,
      data: afterDue,
      symbol: "rect",
      symbolSize: [2, markerHeight],
      itemStyle: { color: tokens.warning },
      encode: { x: 0, y: 1 },
    },
  ];

  return {
    backgroundColor: "transparent",
    animation: !reducedMotion,
    animationDuration: 180,
    animationDurationUpdate: 120,
    animationEasing: "cubicOut",
    textStyle: {
      fontFamily: tokens.fontSans,
      color: tokens.textPrimary,
    },
    aria: {
      enabled: true,
      decal: { show: false },
      label: {
        description: `Gantt chart of ${dated.length} open milestones. Bars show the planned window and closed progress; ticks show open child issues.`,
      },
    },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: tokens.surface,
      borderColor: tokens.borderSubtle,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: tokens.textPrimary,
        fontFamily: tokens.fontSans,
        fontSize: tokens.captionPx,
      },
      extraCssText:
        "box-shadow: var(--shadow-raised); border-radius: var(--radius-md);",
      formatter: (params: unknown) => tooltipOf(params, tokens, repoShortcodes),
    },
    grid: {
      left: 0,
      right: 0,
      top: headerHeight,
      bottom: 0,
      containLabel: false,
    },
    xAxis: {
      type: "time",
      position: "top",
      min: window.start,
      max: window.end,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        color: tokens.textSecondary,
        fontFamily: tokens.fontSans,
        fontSize: tokens.captionPx,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: false,
        alignMinLabel: "left",
        margin: 8,
        formatter: (value: number) => {
          const date = new Date(value);
          return date.getMonth() === 0
            ? formatAxisMonthYear(value)
            : formatAxisMonth(value);
        },
      },
      splitLine: {
        show: true,
        lineStyle: { color: tokens.borderSubtle, width: 1 },
      },
      minorSplitLine: { show: false },
      minInterval: 28 * 86_400_000,
      maxInterval: 31 * 86_400_000,
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      boundaryGap: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: tokens.borderSubtle, width: 1 },
      },
    },
    series,
  };
}

/** A stable empty option for the pre-mount frame. */
export const EMPTY_TIMELINE_OPTIONS: EChartsOption = {
  backgroundColor: "transparent",
  xAxis: { show: false },
  yAxis: { show: false },
  series: [],
};
