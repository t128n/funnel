import 'unplugin-icons/types/svelte';

import type { Session } from "#lib/server/auth/index";

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** App version injected by Vite from `package.json` (see `vite.config.ts`). */
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		interface Locals {
			session: Session["session"] | null;
			user: Session["user"] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
