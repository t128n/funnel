import { apiRole } from "#lib/server/http/session";
import {
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	unreadNotificationCount
} from "#lib/server/notifications/service";
import type { RequestHandler } from "./$types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Parse a bounded, positive integer query value; `undefined` when absent. */
function positiveInt(value: string | null): number | undefined {
	if (value === null || value.trim() === "") return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The signed-in user's notification feed. Every read is scoped to
 * `locals.user.id`; the shared live signal carries no payload, so each browser
 * fetches its own rows here.
 */
export const GET: RequestHandler = ({ url, locals }) => {
	const userId = apiRole(locals, "read");
	if (userId instanceof Response) return userId;

	const limit = Math.min(positiveInt(url.searchParams.get("limit")) ?? DEFAULT_LIMIT, MAX_LIMIT);
	const after = positiveInt(url.searchParams.get("after"));
	const unread = url.searchParams.get("unread");

	return Response.json({
		items: listNotifications(userId, {
			limit,
			after,
			unreadOnly: unread === "1" || unread === "true",
		}),
		unreadCount: unreadNotificationCount(userId),
	});
};

/**
 * Mark one notification read (`{ id }`) or every notification read
 * (`{ all: true }`). Returns the viewer's remaining unread count so the badge
 * can update without a second request.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = apiRole(locals, "read");
	if (userId instanceof Response) return userId;

	const body = (await request.json().catch(() => null)) as
		| { id?: unknown; all?: unknown }
		| null;
	if (!body || typeof body !== "object") {
		return Response.json({ message: "Invalid notification update" }, { status: 400 });
	}

	if (body.all === true) {
		markAllNotificationsRead(userId);
	} else if (typeof body.id === "string" && body.id.length > 0) {
		// Marking an already-read or unknown id is a no-op; the response still
		// carries the viewer's current count so a retry is harmless.
		markNotificationRead(userId, body.id);
	} else {
		return Response.json(
			{ message: "Provide a notification id or { all: true }" },
			{ status: 400 },
		);
	}

	return Response.json({ unreadCount: unreadNotificationCount(userId) });
};
