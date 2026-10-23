import { issueNumberParam } from "#lib/server/issues/http";
import { apiRole } from "#lib/server/http/session";
import {
	isWatching,
	unwatchIssue,
	watchIssue
} from "#lib/server/notifications/service";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import type { RequestHandler } from "./$types";

type WatchContext = Parameters<RequestHandler>[0];

/**
 * Resolve the shared preconditions for every watch verb: a signed-in `read`
 * user, a mirrored repo, and a positive issue number. Watches are keyed on
 * `org/name` + number so they survive mirror rebuilds.
 */
function resolve(ctx: WatchContext): { userId: string; org: string; name: string; number: number } | Response {
	const userId = apiRole(ctx.locals, "read");
	if (userId instanceof Response) return userId;

	const repo = getRepoByOrgName(ctx.params.owner, ctx.params.repo);
	if (!repo) {
		return Response.json(
			{ message: `Repository ${ctx.params.owner}/${ctx.params.repo} is not mirrored` },
			{ status: 404 },
		);
	}

	const number = issueNumberParam(ctx.params.number);
	if (number instanceof Response) return number;

	return { userId, org: repo.org, name: repo.name, number };
}

/** Whether the signed-in user watches this issue. */
export const GET: RequestHandler = (ctx) => {
	const resolved = resolve(ctx);
	if (resolved instanceof Response) return resolved;

	return Response.json({
		watching: isWatching(resolved.userId, resolved.org, resolved.name, resolved.number),
	});
};

/** Start watching; idempotent for repeats. */
export const PUT: RequestHandler = (ctx) => {
	const resolved = resolve(ctx);
	if (resolved instanceof Response) return resolved;

	watchIssue(resolved.userId, resolved.org, resolved.name, resolved.number);
	return Response.json({
		watching: isWatching(resolved.userId, resolved.org, resolved.name, resolved.number),
	});
};

/** Stop watching; idempotent when no watch row exists. */
export const DELETE: RequestHandler = (ctx) => {
	const resolved = resolve(ctx);
	if (resolved instanceof Response) return resolved;

	unwatchIssue(resolved.userId, resolved.org, resolved.name, resolved.number);
	return Response.json({
		watching: isWatching(resolved.userId, resolved.org, resolved.name, resolved.number),
	});
};
