/**
 * Client-safe planning formatting and unit conversion.
 *
 * Minutes are the internal unit; the settings UI and planner render decimal
 * hours. This module deliberately imports nothing server-side so both the
 * browser bundle and the server can use it.
 */

/** Internal minutes → decimal hours, rounded to two places. */
export function minutesToHours(minutes: number): number {
	return Math.round((minutes / 60) * 100) / 100;
}

/** Decimal hours → whole internal minutes. */
export function hoursToMinutes(hours: number): number {
	return Math.round(hours * 60);
}

/**
 * Compact human duration: `2h`, `1h 30m`, `30m`, `0m`. Unknown estimates
 * render as an em dash rather than a misleading zero.
 */
export function formatMinutes(minutes: number | null | undefined): string {
	if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
		return "—";
	}
	const total = Math.max(0, Math.round(minutes));
	const hours = Math.floor(total / 60);
	const rest = total % 60;
	if (hours === 0) return `${rest}m`;
	if (rest === 0) return `${hours}h`;
	return `${hours}h ${rest}m`;
}

/**
 * Fill percentage for a capacity bar, clamped to `0..100`. A zero cap is empty
 * until work exists, then full.
 */
export function barPercent(committedMinutes: number, capMinutes: number): number {
	if (capMinutes <= 0) return committedMinutes > 0 ? 100 : 0;
	const percent = Math.round((committedMinutes / capMinutes) * 100);
	return Math.min(100, Math.max(0, percent));
}
