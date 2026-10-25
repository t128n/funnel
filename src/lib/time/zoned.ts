/**
 * Wall-clock time in an IANA timezone, without a date library.
 *
 * Instants are unix milliseconds. A "wall" time is the local calendar reading
 * at that instant. {@link zonedToInstant} resolves a local date + minute back
 * to an instant; it follows the day-planning DST policy: a time inside a
 * spring-forward gap clamps forward, and an ambiguous fall-back time resolves
 * to the earlier instant.
 *
 * One `Intl.DateTimeFormat` is cached per zone because constructing it is the
 * expensive part of the conversion.
 */

/** A local calendar reading, with minutes 0..59. */
export interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

interface FullParts extends ZonedParts {
	second: number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
	const cached = formatters.get(tz);
	if (cached) return cached;

	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	formatters.set(tz, formatter);
	return formatter;
}

/** True when `tz` is an IANA zone the runtime understands. */
export function isValidTimeZone(tz: string): boolean {
	if (typeof tz !== "string" || tz.trim() === "") return false;
	try {
		formatterFor(tz);
		return true;
	} catch {
		return false;
	}
}

function fullParts(instant: number, tz: string): FullParts {
	if (!Number.isFinite(instant)) {
		throw new RangeError(`Invalid instant: ${instant}`);
	}

	const parts = formatterFor(tz).formatToParts(new Date(instant));
	const values: Record<string, number> = {};
	for (const part of parts) {
		if (part.type === "literal") continue;
		values[part.type] = Number(part.value);
	}

	return {
		year: values.year ?? 0,
		month: values.month ?? 1,
		day: values.day ?? 1,
		hour: values.hour ?? 0,
		minute: values.minute ?? 0,
		second: values.second ?? 0,
	};
}

/** The local calendar reading at `instant` in `tz`. */
export function zonedParts(instant: number, tz: string): ZonedParts {
	const { year, month, day, hour, minute } = fullParts(instant, tz);
	return { year, month, day, hour, minute };
}

/** Local `YYYY-MM-DD` date at `instant` in `tz`. */
export function localDateOf(instant: number, tz: string): string {
	const { year, month, day } = fullParts(instant, tz);
	return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, "0");
}

/** Local wall time as if it were a UTC instant, for offset arithmetic. */
function wallMs(instant: number, tz: string): number {
	const p = fullParts(instant, tz);
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function floorToMinute(instant: number): number {
	return instant - (((instant % MINUTE) + MINUTE) % MINUTE);
}

/** Offset of `tz` at `instant`, in milliseconds east of UTC. */
function offsetAt(instant: number, tz: string): number {
	const base = floorToMinute(instant);
	return wallMs(base, tz) - base;
}

/**
 * Resolve a local `date` (`YYYY-MM-DD`) and `minute` (0..1440, from local
 * midnight) in `tz` to a unix-millisecond instant.
 *
 * Gap times clamp forward (e.g. New York 02:30 on 2026-03-08 → 07:30Z);
 * ambiguous overlap times pick the earlier instant.
 */
export function zonedToInstant(date: string, minute: number, tz: string): number {
	if (!isDateISO(date)) {
		throw new RangeError(`Invalid date: ${date}`);
	}
	if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
		throw new RangeError(`Invalid minute: ${minute}`);
	}
	if (!isValidTimeZone(tz)) {
		throw new RangeError(`Unknown timezone: ${tz}`);
	}

	const [year, month, day] = date.split("-").map(Number) as [number, number, number];
	const target = Date.UTC(year, month - 1, day) + minute * MINUTE;

	const offsets = new Set<number>();
	for (const probe of [target - 2 * DAY, target - DAY, target, target + DAY, target + 2 * DAY]) {
		offsets.add(offsetAt(probe, tz));
	}

	const matches = [...offsets]
		.map((offset) => target - offset)
		.filter((candidate) => wallMs(candidate, tz) === target);
	if (matches.length > 0) {
		return Math.min(...matches);
	}

	// The wall time falls inside a spring-forward gap. The pre-transition
	// offset is the smaller one, and subtracting it shifts the wall time
	// forward by the gap length.
	return target - Math.min(...offsets);
}

/** Add `days` to a `YYYY-MM-DD` date, crossing months and years. */
export function addDaysISO(date: string, days: number): string {
	if (!isDateISO(date)) {
		throw new RangeError(`Invalid date: ${date}`);
	}
	if (!Number.isInteger(days)) {
		throw new RangeError(`Invalid day count: ${days}`);
	}

	const [year, month, day] = date.split("-").map(Number) as [number, number, number];
	const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY);
	return shifted.toISOString().slice(0, 10);
}

/** ISO weekday for a date: Monday is 1, Sunday is 7. */
export function weekdayOf(date: string): number {
	if (!isDateISO(date)) {
		throw new RangeError(`Invalid date: ${date}`);
	}

	const [year, month, day] = date.split("-").map(Number) as [number, number, number];
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return weekday === 0 ? 7 : weekday;
}

/** True for a real calendar date written exactly as `YYYY-MM-DD`. */
export function isDateISO(value: string): boolean {
	if (typeof value !== "string") return false;

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;

	const parsed = new Date(Date.UTC(year, month - 1, day));
	return (
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() === month - 1 &&
		parsed.getUTCDate() === day
	);
}

/** `9:05` or `09:05` → 545 minutes; invalid or `24:00` → `null`. */
export function parseClock(value: string): number | null {
	if (typeof value !== "string") return null;

	const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
	if (!match) return null;

	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour > 23) return null;
	return hour * 60 + minute;
}

/** Minutes from midnight → zero-padded `HH:MM` (1440 → `24:00`). */
export function formatClock(minute: number): string {
	const total = Math.max(0, Math.round(minute));
	return `${pad(Math.floor(total / 60), 2)}:${pad(total % 60, 2)}`;
}
