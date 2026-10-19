/**
 * Liveness probe.
 *
 * Answers "is the process running?" and nothing else — it touches no database
 * or network state, so a failing dependency never causes an orchestrator to
 * restart an otherwise healthy process. Readiness (can it serve traffic?) lives
 * at `/readyz`.
 *
 * Ungated like the other health/intake surfaces: it exposes no data.
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
  json({ status: "ok", service: "funnel" });
