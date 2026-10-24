/**
 * Request descriptions for the epic child API (SPEC §7).
 *
 * The server replaces the whole ordered list, so the editor always sends the
 * complete `children` array. Keeping the request shape here makes the path
 * encoding and body unit-testable without a browser.
 */

/** One request against `.../issues/{number}/epic/children`. */
export interface EpicRequest {
	url: string;
	method: "PUT";
	body: string;
}

/** An open issue offered by the add-child search. */
export interface EpicCandidate {
	ref: string;
	repo: string;
	number: number;
	title: string;
}

/** Split `owner/name` into encoded path segments. */
function repoPath(repo: string): string {
	const slash = repo.indexOf("/");
	const owner = slash > 0 ? repo.slice(0, slash) : repo;
	const name = slash > 0 ? repo.slice(slash + 1) : "";
	return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

/** The full replacement body for an epic's child list. */
export function epicChildrenRequest(
	repo: string,
	number: number,
	children: readonly string[],
): EpicRequest {
	return {
		url: `/api/repos/${repoPath(repo)}/issues/${number}/epic/children`,
		method: "PUT",
		body: JSON.stringify({ children }),
	};
}

/** Append a ref once; blank or duplicate input leaves the list untouched. */
export function addChild(
	children: readonly string[],
	ref: string,
): string[] {
	const trimmed = ref.trim();
	if (trimmed.length === 0 || children.includes(trimmed)) {
		return [...children];
	}
	return [...children, trimmed];
}

/** Drop one ref, preserving the order of the rest. */
export function removeChild(
	children: readonly string[],
	ref: string,
): string[] {
	return children.filter((child) => child !== ref);
}

/** Send the existing list plus one new child. */
export function addChildRequest(
	repo: string,
	number: number,
	children: readonly string[],
	ref: string,
): EpicRequest {
	return epicChildrenRequest(repo, number, addChild(children, ref));
}

/** Send the existing list without one child. */
export function removeChildRequest(
	repo: string,
	number: number,
	children: readonly string[],
	ref: string,
): EpicRequest {
	return epicChildrenRequest(repo, number, removeChild(children, ref));
}

/** Turn a failed child-list response into the inline message. */
export function epicChildErrorMessage(
	status: number,
	payload: unknown,
): string {
	const body = payload as { message?: unknown } | null;
	if (typeof body?.message === "string" && body.message.length > 0) {
		return body.message;
	}
	return `Could not update the epic's children (${status}).`;
}
