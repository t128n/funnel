/**
 * Inbound GitHub webhooks (optional freshness path; polling remains the repair
 * path).
 *
 * GitHub signs the raw request body with the App's webhook secret
 * (`x-hub-signature-256`), so verification happens before any JSON parsing and
 * always over the exact bytes received. Deliveries are deduplicated by
 * `x-github-delivery`: a row is written only after a successful refresh, so a
 * failed delivery is retried by GitHub rather than acknowledged. Payload bodies
 * are never logged — they can contain private issue and comment text.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateWebhookDelivery } from "#lib/server/db/schema";
import { forge } from "#lib/server/forge/providers.server";
import { createLogger, errorFields } from "#lib/server/log";
import * as mirror from "#lib/server/sync/mirror";

const log = createLogger({ component: "github-webhooks" });

/** Hard inbound body limit; GitHub caps webhook payloads well below this. */
export const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;

/** Accepted deliveries are pruned after a week. */
export const DELIVERY_RETENTION_MS = 7 * 86_400_000;

/** At most this many issues are refreshed for one delivery. */
export const MAX_REFRESHES_PER_DELIVERY = 20;

/** The subset of App credentials the receiver needs. */
export interface WebhookCredentials {
  webhookSecret: string | null;
}

/** Injected side effects, so the handler runs offline in tests. */
export interface WebhookDeps {
  /** Current App credentials, or `null` before onboarding. */
  credentials: () => WebhookCredentials | null;
  /** Refresh one mirrored issue (schedules hydration and linked PRs). */
  refreshIssue: (owner: string, repo: string, number: number) => Promise<void>;
  /** Issue numbers linked to one pull request in the mirror. */
  linkedIssues: (
    owner: string,
    repo: string,
    prNumber: number,
  ) => Promise<number[]>;
  /** Clock for `received_at` and pruning. Defaults to `Date.now`. */
  now?: () => number;
}

interface RepoSlug {
  owner: string;
  name: string;
}

interface AcceptedDelivery {
  id: string;
  event: string;
  action: string | null;
  repo: string | null;
  receivedAt: number;
}

/**
 * Constant-time verification of GitHub's `sha256=<hex>` signature over the raw
 * request bytes. Missing, malformed and wrong-length signatures fail closed.
 */
export function verifyWebhookSignature(
  raw: Uint8Array,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const provided = Buffer.from(match[1]!, "hex");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

/** Whether a delivery id has already been accepted. */
export function webhookDeliveryExists(id: string): boolean {
  return (
    db
      .select({ id: stateWebhookDelivery.id })
      .from(stateWebhookDelivery)
      .where(eq(stateWebhookDelivery.id, id))
      .limit(1)
      .get() !== undefined
  );
}

/** Drop accepted deliveries older than the retention window. */
export function pruneWebhookDeliveries(cutoff: number): number {
  return (
    db
      .delete(stateWebhookDelivery)
      .where(lt(stateWebhookDelivery.receivedAt, cutoff))
      .run().changes ?? 0
  );
}

/** Record an accepted delivery; concurrent duplicates keep the first row. */
export function recordWebhookDelivery(delivery: AcceptedDelivery): void {
  db.insert(stateWebhookDelivery)
    .values(delivery)
    .onConflictDoNothing()
    .run();
}

/** Resolve issues linked to a PR through the disposable mirror. */
export async function linkedIssuesForPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<number[]> {
  const ref = forge.repoRef(owner, repo);
  const repoRow = mirror.getRepoBySlug(
    ref.forge,
    ref.instance,
    ref.owner,
    ref.name,
  );
  if (!repoRow) return [];
  return mirror.linkedIssueNumbersForPullRequest(repoRow.id, prNumber);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function repoFromPayload(payload: Record<string, unknown>): RepoSlug | null {
  const repository = asRecord(payload.repository);
  if (!repository) return null;

  const fullName = repository.full_name;
  if (typeof fullName === "string") {
    const parts = fullName.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], name: parts[1] };
    }
  }

  const owner = asRecord(repository.owner)?.login;
  const name = repository.name;
  if (
    typeof owner === "string" &&
    owner.length > 0 &&
    typeof name === "string" &&
    name.length > 0 &&
    !name.includes("/")
  ) {
    return { owner, name };
  }
  return null;
}

/** PR numbers carried by a check event, deduplicated and validated. */
function checkPullRequestNumbers(payload: Record<string, unknown>): number[] {
  const checks =
    asRecord(payload.check_run) ?? asRecord(payload.check_suite) ?? {};
  const pullRequests = Array.isArray(checks.pull_requests)
    ? checks.pull_requests
    : [];
  const numbers = new Set<number>();
  for (const entry of pullRequests) {
    const number = positiveInteger(asRecord(entry)?.number);
    if (number !== null) numbers.add(number);
  }
  return [...numbers];
}

/** Read at most `limit` bytes; the declared length is checked before reading. */
async function readLimitedBody(
  request: Request,
): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > MAX_WEBHOOK_BYTES) return null;
  }

  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function plain(status: number): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function fail(status: number, message: string): Response {
  return Response.json({ message }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

interface RefreshTargets {
  owner: string;
  name: string;
  numbers: number[];
  ignored: boolean;
}

async function resolveTargets(
  event: string,
  payload: Record<string, unknown>,
  repo: RepoSlug,
  deps: WebhookDeps,
): Promise<{ numbers: number[]; ignored: boolean }> {
  if (event === "issues" || event === "issue_comment") {
    const number = positiveInteger(asRecord(payload.issue)?.number);
    return { numbers: number === null ? [] : [number], ignored: number === null };
  }

  const pullRequest = asRecord(payload.pull_request);
  if (
    event === "pull_request" ||
    event === "pull_request_review" ||
    event === "pull_request_review_comment"
  ) {
    const prNumber = positiveInteger(pullRequest?.number);
    if (prNumber === null) return { numbers: [], ignored: true };
    return {
      numbers: await deps.linkedIssues(repo.owner, repo.name, prNumber),
      ignored: false,
    };
  }

  if (event === "check_run" || event === "check_suite") {
    const prNumbers = checkPullRequestNumbers(payload);
    if (prNumbers.length === 0) return { numbers: [], ignored: true };
    const linked = await Promise.all(
      prNumbers.map((prNumber) =>
        deps.linkedIssues(repo.owner, repo.name, prNumber),
      ),
    );
    return { numbers: linked.flat(), ignored: false };
  }

  return { numbers: [], ignored: true };
}

function refreshNumbers(targets: RefreshTargets): number[] {
  return [...new Set(targets.numbers)]
    .filter((number) => Number.isInteger(number) && number > 0)
    .slice(0, MAX_REFRESHES_PER_DELIVERY);
}

/**
 * Verify and process one webhook request.
 *
 * Returns `413` above the size limit, `503` when the App has no webhook secret,
 * `401` for a bad signature, `400` for missing headers or malformed JSON, `200`
 * for processed/duplicate events, `202` for deliberately ignored events, and
 * `500` when processing failed (no delivery row is written, so GitHub retries).
 */
export async function handleWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  const raw = await readLimitedBody(request);
  if (raw === null) {
    log.warn({ path: "/api/github/webhooks" }, "webhook body too large");
    return fail(413, "Payload too large");
  }

  const credentials = deps.credentials();
  const secret = credentials?.webhookSecret;
  if (!secret) {
    log.warn("webhook received but no webhook secret is configured");
    return fail(503, "Webhook secret is not configured");
  }

  const delivery = request.headers.get("x-github-delivery")?.trim() ?? "";
  const event = request.headers.get("x-github-event")?.trim() ?? "";
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(raw, signature, secret)) {
    log.warn(
      { delivery: delivery || null, event: event || null },
      "webhook signature rejected",
    );
    return fail(401, "Invalid signature");
  }

  if (!delivery || !event) {
    return fail(400, "Missing delivery or event header");
  }

  let payload: Record<string, unknown>;
  try {
    payload = asRecord(JSON.parse(new TextDecoder().decode(raw))) ?? {};
  } catch {
    return fail(400, "Request body must be valid JSON");
  }

  const now = deps.now?.() ?? Date.now();

  if (webhookDeliveryExists(delivery)) {
    // A signed duplicate still counts as accepted, so keep the table bounded.
    pruneWebhookDeliveries(now - DELIVERY_RETENTION_MS);
    log.info(
      { delivery, event, action: stringOrNull(payload.action) },
      "duplicate webhook delivery ignored",
    );
    return plain(200);
  }

  const repo = repoFromPayload(payload);
  const action = stringOrNull(payload.action);
  const fields = {
    delivery,
    event,
    action,
    repo: repo ? `${repo.owner}/${repo.name}` : null,
  };

  if (event === "ping") {
    accept(delivery, event, action, repo, now);
    log.info(fields, "webhook ping accepted");
    return plain(200);
  }

  if (
    !repo ||
    ![
      "issues",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "pull_request_review_comment",
      "check_run",
      "check_suite",
    ].includes(event)
  ) {
    accept(delivery, event, action, repo, now);
    log.info(fields, "webhook event ignored");
    return plain(202);
  }

  let targets: RefreshTargets;
  try {
    const resolved = await resolveTargets(event, payload, repo, deps);
    targets = {
      owner: repo.owner,
      name: repo.name,
      numbers: resolved.numbers,
      ignored: resolved.ignored,
    };
  } catch (error) {
    log.error({ ...fields, ...errorFields(error) }, "webhook processing failed");
    return fail(500, "Webhook processing failed");
  }

  if (targets.ignored) {
    accept(delivery, event, action, repo, now);
    log.info(fields, "webhook payload had no usable target");
    return plain(202);
  }

  const numbers = refreshNumbers(targets);
  let failed = false;
  for (const number of numbers) {
    try {
      await deps.refreshIssue(targets.owner, targets.name, number);
      log.info({ ...fields, number }, "webhook refreshed issue");
    } catch (error) {
      failed = true;
      log.warn(
        { ...fields, number, ...errorFields(error) },
        "webhook issue refresh failed",
      );
    }
  }

  if (failed) {
    // Leave no delivery row: a retry can repair the issues that failed.
    return fail(500, "Webhook refresh failed");
  }

  accept(delivery, event, action, repo, now);
  log.info({ ...fields, refreshed: numbers.length }, "webhook accepted");
  return plain(200);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function accept(
  delivery: string,
  event: string,
  action: string | null,
  repo: RepoSlug | null,
  now: number,
): void {
  pruneWebhookDeliveries(now - DELIVERY_RETENTION_MS);
  recordWebhookDelivery({
    id: delivery,
    event,
    action,
    repo: repo ? `${repo.owner}/${repo.name}` : null,
    receivedAt: now,
  });
}
