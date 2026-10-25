/**
 * Bugzilla-style display vocabulary for the Inspector.
 *
 * Pure and dependency-free so the same tokens can be unit-tested and reused by
 * any surface that renders an issue's status, resolution or severity.
 */

const STATUS_TOKENS: Readonly<Record<string, string>> = {
	backlog: "BACKLOG",
	todo: "TODO",
	"in-progress": "IN PROGRESS",
	"in-review": "IN REVIEW",
	done: "DONE"
};

/**
 * The uppercase status token. A status always wins, even on a closed thread
 * (the stage it was closed from). Without a status an open thread is
 * `UNCONFIRMED` and a closed one is `CLOSED`.
 */
export function statusToken(status: string | null, state: string): string {
	if (status) {
		const trimmed = status.trim();
		if (trimmed.length > 0) {
			return STATUS_TOKENS[trimmed] ?? trimmed.toUpperCase().replace(/-/g, " ");
		}
	}
	return state === "closed" ? "CLOSED" : "UNCONFIRMED";
}

/** The GitHub close reason as Bugzilla's resolution vocabulary. */
export function resolutionFor(stateReason: string | null): string {
	switch (stateReason) {
		case "completed":
			return "FIXED";
		case "not_planned":
			return "WONTFIX";
		case "duplicate":
			return "DUPLICATE";
		case "reopened":
			return "REOPENED";
		default:
			return "—";
	}
}

/** The severity word for an impact level (`1` → `blocker`). */
export function severityWord(impact: number | null): string {
	switch (impact) {
		case 1:
			return "blocker";
		case 2:
			return "major";
		case 3:
			return "minor";
		default:
			return "—";
	}
}
