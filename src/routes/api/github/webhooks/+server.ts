import { getGithubCredentials } from "#lib/server/github/credentials";
import {
  handleWebhook,
  linkedIssuesForPullRequest,
} from "#lib/server/github/webhooks";
import { refreshIssue } from "#lib/server/sync/worker";
import type { RequestHandler } from "./$types";

/**
 * GitHub App webhook receiver. Deliberately unauthenticated: GitHub calls it
 * without a Funnel session, and the HMAC signature over the raw body is the
 * authentication. Polling is still the repair path when a delivery is missed.
 */
export const POST: RequestHandler = ({ request }) =>
  handleWebhook(request, {
    credentials: getGithubCredentials,
    refreshIssue,
    linkedIssues: linkedIssuesForPullRequest,
  });
