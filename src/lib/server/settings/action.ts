/**
 * Shared `save` action body for the `/settings/*` instance sections.
 *
 * Every section posts its slice as a single hidden JSON `payload`; this helper
 * authenticates, parses it, and applies it through {@link saveSettings}
 * (validation + persistence + propagation). Returning `fail(...)` keeps the
 * field-level errors on the page.
 */
import { fail } from "@sveltejs/kit";
import { saveSettings } from "./apply";

export async function saveSettingsAction(request: Request, locals: App.Locals) {
  // The `(app)` layout gates page loads, but actions do not run a layout load,
  // so re-check the session here (SPEC §8).
  if (!locals.user) return fail(401, { message: "Not authenticated" });

  const form = await request.formData();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return fail(400, { message: "Malformed settings payload" });
  }

  const result = saveSettings(raw);
  if (!result.ok) {
    return fail(result.status, {
      message: result.message,
      issues: result.issues,
    });
  }

  return { saved: true };
}
