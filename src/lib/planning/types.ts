/**
 * Shared day-planning data types. Skeleton: shapes are the ones the plan's
 * `planning.work_defaults` payload names; implementers refine the rest.
 */
import type { IsoDate, Minute } from "#lib/time/types";

/** A half-open minute interval `[start, end)`. */
export interface MinuteRange {
	start: Minute;
	end: Minute;
}

/** A recurring availability window on one ISO weekday (1 = Monday). */
export interface DayWindow {
	weekday: number;
	start_minute: Minute;
	end_minute: Minute;
}

/** The per-user working-hours configuration. */
export interface WorkHours {
	timezone: string;
	start_minute: Minute;
	end_minute: Minute;
	work_days: number[];
	buffer_percent: number;
}

/** Caller-supplied day block, before validation. */
export interface DayBlockInput {
	date: IsoDate;
	start_minute: Minute;
	end_minute: Minute;
	title: string;
}

/** A durable day block. */
export interface DayBlock extends DayBlockInput {
	id: string;
}

/** A scheduling candidate offered for a day. */
export interface DayCandidate {
	id: string;
	title: string;
	minutes: number;
	date: IsoDate;
}

/** The `/plan` day horizon payload. */
export interface DayView {
	date: IsoDate;
	blocks: DayBlock[];
	candidates: DayCandidate[];
}
