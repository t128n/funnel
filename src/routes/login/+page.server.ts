import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Only allow same-origin relative redirect targets (no open redirects). */
function safeRedirect(target: string | null): string {
  if (!target) return "/inbox";
  if (!target.startsWith("/") || target.startsWith("//")) return "/inbox";
  return target;
}

export const load: PageServerLoad = ({ locals, url }) => {
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"));
  if (locals.user) throw redirect(303, redirectTo);
  return { redirectTo };
};
