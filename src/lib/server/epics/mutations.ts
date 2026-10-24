/**
 * Epic write actions (SPEC §3, §7).
 *
 * Marking an epic is a normal reserved-label edit; the child list is the
 * `epic.children` scalar in the issue body, edited through the signed-in
 * user's token so it survives a mirror rebuild. There is no membership table.
 *
 * Validation happens before any network write: malformed refs, self references
 * and nested epics are rejected, and a child already listed by another epic is
 * a conflict. The body rewrite preserves every other metadata section.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  formatEpicRef,
  parseEpicRef,
  readEpicChildren,
  writeEpicChildren,
  type EpicRef,
} from "#lib/funnel-metadata";
import { db } from "#lib/server/db/index";
import {
  mirrorRepo,
  mirrorThread,
} from "#lib/server/db/schema";
import { forge, type GitHubProvider } from "#lib/server/forge/providers.server";
import {
  errorMessage,
  errorStatus,
  type Outcome,
} from "#lib/server/http/outcome";
import {
  addIssueLabels,
  removeIssueLabel,
  updateIssue,
} from "#lib/server/issues/mutations";

export interface SetEpicLabelInput {
  /** User-token provider (SPEC §8). */
  provider: GitHubProvider;
  /** `owner/name`. */
  repo: string;
  number: number;
  isEpic: boolean;
}

export interface SetEpicChildrenInput {
  /** User-token provider (SPEC §8). */
  provider: GitHubProvider;
  /** `owner/name` of the epic issue. */
  repo: string;
  number: number;
  /** Complete replacement list of `owner/name#number` refs. */
  children: readonly string[];
}

export interface SetEpicLabelResult {
  isEpic: boolean;
}

export interface SetEpicChildrenResult {
  children: string[];
}

function badRequest(message: string): Outcome<never> {
  return { ok: false, status: 400, message };
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash === repo.length - 1) return null;
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}

function sameIssue(
  ref: EpicRef,
  self: { owner: string; name: string; number: number },
): boolean {
  return (
    ref.number === self.number &&
    ref.owner.toLowerCase() === self.owner.toLowerCase() &&
    ref.name.toLowerCase() === self.name.toLowerCase()
  );
}

function refKey(ref: EpicRef): string {
  return `${ref.owner.toLowerCase()}/${ref.name.toLowerCase()}#${ref.number}`;
}

function selfOf(row: {
  org: string;
  name: string;
  number: number;
}): EpicRef {
  return { owner: row.org, name: row.name, number: row.number };
}

/** Whether a mirrored child carries the `epic` label (nested-epic guard). */
function childIsEpic(ref: EpicRef): boolean {
  const row = db
    .select({ isEpic: mirrorThread.isEpic })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      and(
        sql`lower(${mirrorRepo.org}) = ${ref.owner.toLowerCase()}`,
        sql`lower(${mirrorRepo.name}) = ${ref.name.toLowerCase()}`,
        eq(mirrorThread.number, ref.number),
      ),
    )
    .get();
  return row?.isEpic === 1;
}

/** The epic that already lists `ref`, excluding `selfNumber` in `repo`. */
function existingParent(
  ref: EpicRef,
  self: { owner: string; name: string; number: number },
): string | undefined {
  const rows = db
    .select({
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorThread.number,
      body: mirrorThread.body,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(eq(mirrorThread.isEpic, 1))
    .all();

  const wanted = refKey(ref);
  for (const row of rows) {
    const alreadyIsThisEpic =
      row.org.toLowerCase() === self.owner.toLowerCase() &&
      row.name.toLowerCase() === self.name.toLowerCase() &&
      row.number === self.number;
    if (alreadyIsThisEpic) continue;
    const listed = readEpicChildren(row.body, selfOf(row));
    if (listed.some((child) => refKey(parseEpicRef(child)!) === wanted)) {
      return `${row.org}/${row.name}#${row.number}`;
    }
  }
  return undefined;
}

/** Add or remove the `epic` label. Removing it leaves the child list intact. */
export async function setEpicLabel(
  input: SetEpicLabelInput,
): Promise<Outcome<SetEpicLabelResult>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const result = input.isEpic
    ? await addIssueLabels({
        provider: input.provider,
        repo: input.repo,
        number: input.number,
        labels: ["epic"],
      })
    : await removeIssueLabel({
        provider: input.provider,
        repo: input.repo,
        number: input.number,
        name: "epic",
      });

  if (!result.ok) return result;
  return { ok: true, value: { isEpic: input.isEpic } };
}

/**
 * Replace an epic's child list (SPEC §7). The full list is rewritten through
 * the user token, preserving the body's other metadata sections.
 */
export async function setEpicChildren(
  input: SetEpicChildrenInput,
): Promise<Outcome<SetEpicChildrenResult>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const self = { owner: parts.owner, name: parts.name, number: input.number };
  const children: EpicRef[] = [];
  const seen = new Set<string>();

  for (const raw of input.children) {
    const ref = parseEpicRef(raw.trim());
    if (!ref) return badRequest(`Invalid epic reference: ${raw}`);
    if (sameIssue(ref, self)) {
      return badRequest("An epic cannot contain itself");
    }
    if (childIsEpic(ref)) {
      return badRequest(`Nested epics are not supported: ${raw.trim()}`);
    }
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const parent = existingParent(ref, self);
    if (parent) {
      return {
        ok: false,
        status: 409,
        message: `${raw.trim()} already belongs to ${parent}`,
      };
    }
    children.push(ref);
  }

  const ref = forge.threadRef(
    forge.repoRef(parts.owner, parts.name),
    "issue",
    input.number,
  );

  let body: string;
  try {
    const thread = await input.provider.threads.get(ref);
    body = thread.body ?? "";
  } catch (error) {
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }

  const nextBody = writeEpicChildren(
    body,
    children.map((child) => formatEpicRef(child)),
  );
  const updated = await updateIssue({
    provider: input.provider,
    repo: input.repo,
    number: input.number,
    body: nextBody,
  });
  if (!updated.ok) return updated;

  return {
    ok: true,
    value: { children: children.map((child) => formatEpicRef(child)) },
  };
}
