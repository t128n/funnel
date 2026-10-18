/**
 * Public intake-form contract shared by the submit route and the page.
 *
 * The form is reachable as `GET /submit?title=…&body=…&source=…` so external
 * tools can link straight to a prefilled draft. Parsing lives here (rather than
 * in the route) so the limits and source normalisation stay testable without
 * booting the database.
 */

/** GitHub caps issue titles at 256 characters; mirror that on the form. */
export const INTAKE_TITLE_MAX = 256;

/** The JSON intake endpoint accepts at most 65 536 body characters. */
export const INTAKE_BODY_MAX = 65_536;

/** Provenance labels are short; clamp hostile links before they reach the DOM. */
export const INTAKE_SOURCE_MAX = 128;

/** Canonical provenance choices offered by the standalone submitter. */
export const INTAKE_SOURCES = [
  { value: "chat", label: "Chat" },
  { value: "email", label: "Email" },
  { value: "web", label: "Web" },
  { value: "cli", label: "CLI" },
] as const;

export interface SubmitPrefill {
  title: string;
  body: string;
  source: string;
}

/**
 * Map a free-form source onto a known option. Unknown labels are preserved so
 * integrations can keep their own provenance string (`slack`, `linear`, …).
 */
export function normalizeIntakeSource(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  return INTAKE_SOURCES.find((source) => source.value === lower)?.value ?? value;
}

/**
 * Read the three supported prefill parameters. Titles are trimmed (matching
 * the action), bodies keep their author formatting, and every value is clamped
 * before it is rendered.
 */
export function readSubmitPrefill(params: URLSearchParams): SubmitPrefill {
  return {
    title: (params.get("title") ?? "").trim().slice(0, INTAKE_TITLE_MAX),
    body: (params.get("body") ?? "").slice(0, INTAKE_BODY_MAX),
    source: normalizeIntakeSource(params.get("source") ?? "").slice(0, INTAKE_SOURCE_MAX),
  };
}

export function hasSubmitPrefill(prefill: SubmitPrefill): boolean {
  return Boolean(prefill.title || prefill.body || prefill.source);
}
