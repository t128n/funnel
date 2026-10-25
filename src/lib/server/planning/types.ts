/**
 * Shared server-side day-planning types. Skeleton.
 */

/** A rotated calendar feed token, ready to be rendered as an ICS URL. */
export interface CalendarFeedToken {
	token: string;
	url: string;
}

/** The user a calendar feed token belongs to. */
export interface CalendarFeedOwner {
	userId: string;
}
