/**
 * Client-side error hook (SPEC §10.2).
 *
 * Runs for every error thrown while navigating in the browser, except
 * redirects. Errors already transformed on the server are not passed here
 * again, so this catches client-only failures (a render crash, a bad chunk, an
 * uncaught load error). There is no error-reporting backend; the value is a
 * developer console line with enough context to reproduce. Returning nothing
 * keeps SvelteKit's default status/message in the error page.
 */
import type { HandleClientError } from "@sveltejs/kit/hooks";

export const handleError: HandleClientError = ({ kind, error, event }) => {
  if (kind === "unknown") {
    console.error("[funnel] unexpected client error", {
      url: event.url.href,
      error,
    });
  }
  return {};
};
