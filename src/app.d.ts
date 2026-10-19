import 'unplugin-icons/types/svelte';

import type { Session } from "#lib/server/auth/index";

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** App version injected by Vite from `package.json` (see `vite.config.ts`). */
	const __APP_VERSION__: string;

	namespace App {
		interface Error {
			/**
			 * Correlation id for an unexpected error, echoed to the client so a
			 * user can quote it when reporting. Only set for unhandled (5xx)
			 * errors; see `handleError` in `hooks.server.ts`.
			 */
			id?: string;
		}
		interface Locals {
			session: Session["session"] | null;
			user: Session["user"] | null;
			/** Per-request correlation id, set by the `handle` hook. */
			requestId: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
