/**
 * Human-facing copy for HTTP error statuses.
 *
 * Shared by the error page and any surface that needs to explain a failed
 * request. Keeping the mapping here (rather than in the component) means the
 * wording is testable and can never drift between the root `+error.svelte`, the
 * static `error.html` fallback, and inline error states.
 *
 * The contract that matters for production: a message is only ever shown to the
 * user for a *client* error (4xx), where it is safe and useful. A 5xx message
 * can carry upstream text or internal detail, so {@link safeErrorMessage}
 * replaces it with the generic copy.
 */

/** The title and description shown for one error status. */
export interface ErrorCopy {
	/** Short heading, e.g. "Page not found". */
	title: string;
	/** One or two sentences explaining what happened and what to do. */
	description: string;
}

const COPY: Record<number, ErrorCopy> = {
	400: {
		title: 'Bad request',
		description: 'That request was malformed. Check the link and try again.',
	},
	401: {
		title: 'Sign in required',
		description: 'Your session has ended. Sign in to continue.',
	},
	403: {
		title: 'Access denied',
		description: "You don't have permission to view this.",
	},
	404: {
		title: 'Page not found',
		description: "The page you're looking for doesn't exist or has moved.",
	},
	405: {
		title: 'Method not allowed',
		description: "That action isn't supported here.",
	},
	408: {
		title: 'Request timed out',
		description: 'The server took too long to respond. Try again.',
	},
	409: {
		title: 'Conflict',
		description: 'The resource changed while you were working. Reload and try again.',
	},
	410: {
		title: 'Gone',
		description: 'This resource has been removed and is no longer available.',
	},
	413: {
		title: 'Payload too large',
		description: 'That upload is larger than this instance allows.',
	},
	429: {
		title: 'Too many requests',
		description: 'You’re going a little fast. Wait a moment and try again.',
	},
	500: {
		title: 'Something went wrong',
		description: 'An unexpected error occurred on our end. Try again in a moment.',
	},
	502: {
		title: 'Upstream error',
		description: 'A service Funnel depends on returned an error. Try again in a moment.',
	},
	503: {
		title: 'Service unavailable',
		description: 'Funnel is temporarily unavailable. Try again in a moment.',
	},
	504: {
		title: 'Upstream timeout',
		description: 'A service Funnel depends on took too long to respond. Try again.',
	},
};

/** True for statuses that indicate a server-side failure. */
export function isServerError(status: number): boolean {
	return status >= 500;
}

/** The title/description for a status, with sensible fallbacks. */
export function describeError(status: number): ErrorCopy {
	const known = COPY[status];
	if (known) return known;
	if (isServerError(status)) return COPY[500];
	return {
		title: 'Request failed',
		description: `The server responded with status ${status}.`,
	};
}

/**
 * The message safe to show for a status. Client messages are passed through;
 * server messages (and empty ones) fall back to the generic description so
 * upstream or internal detail never reaches the browser.
 */
export function safeErrorMessage(
	status: number,
	message?: string | null,
): string {
	if (isServerError(status)) return describeError(status).description;
	const trimmed = message?.trim();
	return trimmed && trimmed.length > 0
		? trimmed
		: describeError(status).description;
}
