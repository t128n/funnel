/**
 * The canonical delay reasons (SPEC §2). The list lives in the shared metadata
 * module so client dialogs and server code use the same values; this module is
 * the server-side entry point and adds validation helpers.
 */
import { DELAY_REASONS, type DelayReason } from "#lib/funnel-metadata";

export { DELAY_REASONS, type DelayReason };

/** Whether an arbitrary value is one of the canonical delay reasons. */
export function isDelayReason(value: unknown): value is DelayReason {
  return (
    typeof value === "string" &&
    (DELAY_REASONS as readonly string[]).includes(value)
  );
}

/** Coerce an arbitrary value to a delay reason, defaulting to `other`. */
export function normalizeDelayReason(value: unknown): DelayReason {
  return isDelayReason(value) ? value : "other";
}
