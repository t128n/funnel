/**
 * Presentation helpers for the planner.
 *
 * Pure and dependency-free so the Svelte components and bun tests share one
 * definition of the week headline.
 */

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

interface CalendarDay {
	year: number;
	month: number;
	day: number;
}

/** Parse a `YYYY-MM-DD` date into its UTC calendar parts. */
function calendarDay(value: string): CalendarDay | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const ms = Date.UTC(year, month - 1, day);
	const date = new Date(ms);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return { year, month, day };
}

/** `2026-11-02` → `Week of 2 Nov 2026`. */
export function weekHeadline(week: string): string {
	const date = calendarDay(week);
	if (date === null) return week;
	return `Week of ${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}
