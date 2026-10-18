/**
 * Public intake-form contract shared by the submit route and the page.
 *
 * The form is reachable as `GET /intake?title=…&body=…&source=…` so external
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

/** Deeplinks past this length are refused rather than copied. */
export const INTAKE_DEEPLINK_MAX = 8_000;

/** Canonical provenance choices offered by the standalone submitter. */
export const INTAKE_SOURCES = [
  { value: "email", label: "Email" },
  { value: "chat", label: "Chat" },
  { value: "meeting", label: "Meeting" },
  { value: "walk-in", label: "Walk-in" },
  { value: "self-service", label: "Self-Service" },
] as const;

export interface SubmitPrefill {
  title: string;
  body: string;
  source: string;
}

/** A raw prefill before the shared limits are applied. */
export interface SubmitPrefillInput {
  title?: string;
  body?: string;
  source?: string;
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
 * Apply the intake limits to a raw payload. Titles and sources are trimmed
 * (matching the action), bodies keep their author formatting, and every value
 * is clamped. Shared by the plain query params and the compact deeplink.
 */
export function clampSubmitPrefill(input: SubmitPrefillInput): SubmitPrefill {
  return {
    title: (input.title ?? "").trim().slice(0, INTAKE_TITLE_MAX),
    body: (input.body ?? "").slice(0, INTAKE_BODY_MAX),
    source: normalizeIntakeSource(input.source ?? "").slice(0, INTAKE_SOURCE_MAX),
  };
}

/**
 * Read the three plain-text prefill parameters. Deeplink decoding layers on top
 * of this in `#lib/server/intake/prefill`.
 */
export function readSubmitPrefill(params: URLSearchParams): SubmitPrefill {
  return clampSubmitPrefill({
    title: params.get("title") ?? "",
    body: params.get("body") ?? "",
    source: params.get("source") ?? "",
  });
}

export function hasSubmitPrefill(prefill: SubmitPrefill): boolean {
  return Boolean(prefill.title || prefill.body || prefill.source);
}
