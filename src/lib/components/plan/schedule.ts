/**
 * Request descriptions for the plan API.
 *
 * Kept separate from the dialog so the path encoding and the exact JSON body
 * are unit-testable without a browser. The API accepts only `week_start`.
 */

/** One request against `/api/repos/{owner}/{repo}/issues/{number}/plan`. */
export interface PlanRequest {
	url: string;
	method: "PUT" | "DELETE";
	/** JSON body; absent for DELETE. */
	body?: string;
}

/** Split `owner/name` into encoded path segments. */
function repoPath(repo: string): string {
	const slash = repo.indexOf("/");
	const owner = slash > 0 ? repo.slice(0, slash) : repo;
	const name = slash > 0 ? repo.slice(slash + 1) : "";
	return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

/**
 * Schedule (or move) an issue to a Monday week: `PUT` with exactly
 * `{"week_start":"YYYY-MM-DD"}`.
 */
export function scheduleRequest(
	repo: string,
	number: number,
	weekStart: string,
): PlanRequest {
	return {
		url: `/api/repos/${repoPath(repo)}/issues/${number}/plan`,
		method: "PUT",
		body: JSON.stringify({ week_start: weekStart }),
	};
}

/** Remove an issue's plan item: `DELETE` on the same path. */
export function unscheduleRequest(
	repo: string,
	number: number,
): PlanRequest {
	return {
		url: `/api/repos/${repoPath(repo)}/issues/${number}/plan`,
		method: "DELETE",
	};
}

/**
 * Turn a failed schedule response into the inline message.
 *
 * A `409` names the cap violation; any other status falls back to the server's
 * message or a generic one. Per-maintainer violations are appended so the user
 * sees who is over and by how much.
 */
export function scheduleErrorMessage(
	status: number,
	payload: unknown,
): string {
	const body = payload as
		| {
				message?: unknown;
				violations?: Array<{
					login?: unknown;
					excessMinutes?: unknown;
				}>;
		  }
		| null;
	const message =
		typeof body?.message === "string" && body.message.length > 0
			? body.message
			: `Could not schedule this issue (${status}).`;
	const violations = body?.violations
		?.filter((violation) => typeof violation.login === "string")
		.map((violation) => {
			const excess =
				typeof violation.excessMinutes === "number"
					? ` (+${violation.excessMinutes} min)`
					: "";
			return `${violation.login}${excess}`;
		});
	return violations && violations.length > 0
		? `${message} Over cap: ${violations.join(", ")}.`
		: message;
}
