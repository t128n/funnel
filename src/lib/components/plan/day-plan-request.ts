/**
 * Request descriptions for the personal day-plan API.
 *
 * Kept separate from `DayPlan.svelte` so the paths and exact JSON bodies are
 * unit-testable without a browser. `#lib/planning/day-plan` is pure, so this
 * module stays client-safe.
 */
import type { DayBlockInput } from "#lib/planning/day-plan";

/** One request against `/api/me/day-plan` or its auto-plan sibling. */
export interface DayRequest {
  /** Absolute API path. */
  url: string;
  method: "PUT" | "POST";
  /** JSON body; always present. */
  body: string;
}

/** The API's wire shape: exactly the six block fields, no stored id or date. */
function wire(block: DayBlockInput): DayBlockInput {
  return {
    startMinute: block.startMinute,
    minutes: block.minutes,
    kind: block.kind,
    org: block.org,
    name: block.name,
    issueNumber: block.issueNumber,
  };
}

/**
 * Replace one day with the supplied blocks: `PUT` with exactly
 * `{"date":"YYYY-MM-DD","blocks":[...]}`.
 */
export function saveDayRequest(
  date: string,
  blocks: readonly DayBlockInput[],
): DayRequest {
  return {
    url: "/api/me/day-plan",
    method: "PUT",
    body: JSON.stringify({ date, blocks: blocks.map(wire) }),
  };
}

/**
 * Auto-plan one day: `POST /api/me/day-plan/auto` with exactly
 * `{"date":"YYYY-MM-DD"}`.
 */
export function autoPlanRequest(date: string): DayRequest {
  return {
    url: "/api/me/day-plan/auto",
    method: "POST",
    body: JSON.stringify({ date }),
  };
}

/**
 * Turn a failed day-plan response into the inline message. A `401` sends the
 * viewer back through sign-in; a `400` keeps the server's validation text
 * verbatim so overlap messages line up with the model.
 */
export function dayErrorMessage(status: number, payload: unknown): string {
  if (status === 401) return "Sign in again";

  const body = payload as { message?: unknown } | null;
  if (typeof body?.message === "string" && body.message.length > 0) {
    return body.message;
  }
  return `Could not save the day (${status}).`;
}
