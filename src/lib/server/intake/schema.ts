/**
 * Intake request schema (SPEC §6.1).
 *
 * Lives in its own module — not in the route handler — because SvelteKit's
 * build-time export check rejects non-endpoint exports from `+server.ts`, and
 * both the handler and `tests/openapi.test.ts` (which guards
 * `static/openapi.yml` against drift) need the schema.
 */
import * as v from "valibot";

/**
 * GitHub caps issue titles at 256 characters; mirror that here.
 *
 * `tests/openapi.test.ts` converts this to JSON Schema and compares it against
 * the published `static/openapi.yml`, so the two can never drift.
 */
export const intakeSchema = v.object({
  title: v.pipe(
    v.string("Title must be a string"),
    v.description(
      "Issue title. Trimmed; must be non-empty and at most 256 characters.",
    ),
    v.trim(),
    v.nonEmpty("Title is required"),
    v.maxLength(256, "Title must be at most 256 characters"),
  ),
  body: v.optional(
    v.pipe(
      v.string("Body must be a string"),
      v.description("Issue body (Markdown). At most 65536 characters."),
      v.maxLength(65536),
    ),
    "",
  ),
  source: v.optional(
    v.pipe(
      v.string(),
      v.description(
        "Free-form provenance label, e.g. the calling page or CLI. Trimmed.",
      ),
      v.trim(),
    ),
    "",
  ),
});
