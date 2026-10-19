/**
 * Issue attachment storage ("dropbox"), Funnel-owned durable state.
 *
 * Metadata lives in `state_attachment` (keyed by `org/name` + issue number, so
 * it survives mirror pruning); the bytes live on disk under
 * `FUNNEL_UPLOAD_DIR`. The on-disk path is *server-generated*
 * (`<yyyy>/<mm>/<uuid>`) and never derived from the client filename, so a
 * malicious name cannot escape the upload directory. Downloads always carry the
 * original name via `Content-Disposition`.
 *
 * Kept dependency-light on purpose: node `fs`/`crypto` run under Bun.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { FUNNEL_UPLOAD_DIR, FUNNEL_UPLOAD_MAX_BYTES } from "$app/env/private";
import { db } from "#lib/server/db/index";
import { stateAttachment } from "#lib/server/db/schema";
import type { AttachmentItem, UserRef } from "#lib/server/issues/types";

type AttachmentRow = typeof stateAttachment.$inferSelect;

/** Maximum accepted size of a single upload, in bytes. */
export function maxUploadBytes(): number {
  return Number(FUNNEL_UPLOAD_MAX_BYTES);
}

function rootDir(): string {
  return resolve(FUNNEL_UPLOAD_DIR);
}

/** Absolute path for a stored (relative) path, rejecting any escape. */
function absolutePath(storedPath: string): string | null {
  const root = rootDir();
  const full = resolve(root, storedPath);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

/**
 * Strip directory separators and control characters from a client filename so
 * it is safe to store, echo in a header, and show in the UI. Empty results
 * degrade to a stable placeholder.
 */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : "attachment";
}

function toItem(row: AttachmentRow): AttachmentItem {
  const uploadedBy: UserRef | null = row.uploadedByLogin
    ? { githubId: row.uploadedByGithubId ?? 0, login: row.uploadedByLogin, avatarUrl: "" }
    : null;
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy,
    createdAt: row.createdAt,
  };
}

export interface SaveAttachmentInput {
  org: string;
  name: string;
  issueNumber: number;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  uploadedBy: UserRef | null;
}

/** Write the bytes to disk and insert the metadata row. */
export async function saveAttachment(
  input: SaveAttachmentInput,
): Promise<AttachmentItem> {
  const id = crypto.randomUUID();
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const storedPath = `${yyyy}/${mm}/${id}`;
  const full = absolutePath(storedPath);
  if (!full) throw new Error("Resolved upload path escaped the upload directory");

  await mkdir(join(rootDir(), yyyy, mm), { recursive: true });
  await writeFile(full, input.bytes);

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const createdAt = Date.now();
  db.insert(stateAttachment)
    .values({
      id,
      org: input.org,
      name: input.name,
      issueNumber: input.issueNumber,
      filename: sanitizeFilename(input.filename),
      storedPath,
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: input.bytes.byteLength,
      sha256,
      uploadedByGithubId: input.uploadedBy?.githubId ?? null,
      uploadedByLogin: input.uploadedBy?.login ?? "",
      createdAt,
    })
    .run();

  return toItem(getRow(id) as AttachmentRow);
}

/** Every attachment for one issue, oldest first. */
export function listAttachments(
  org: string,
  name: string,
  issueNumber: number,
): AttachmentItem[] {
  return db
    .select()
    .from(stateAttachment)
    .where(
      and(
        eq(stateAttachment.org, org),
        eq(stateAttachment.name, name),
        eq(stateAttachment.issueNumber, issueNumber),
      ),
    )
    .orderBy(asc(stateAttachment.createdAt))
    .all()
    .map(toItem);
}

export function getAttachment(id: string): AttachmentItem | undefined {
  const row = getRow(id);
  return row ? toItem(row) : undefined;
}

/** The stored bytes plus the row needed for the download headers. */
export interface AttachmentDownload {
  item: AttachmentItem;
  data: Uint8Array;
}

export async function readAttachment(
  id: string,
): Promise<AttachmentDownload | undefined> {
  const row = getRow(id);
  if (!row) return undefined;
  const full = absolutePath(row.storedPath);
  if (!full) return undefined;
  try {
    const data = await readFile(full);
    return { item: toItem(row), data };
  } catch {
    // Row without a file (manual cleanup): treat as missing.
    return undefined;
  }
}

/** The issue an attachment belongs to, for SSE invalidation. */
export interface AttachmentTarget {
  org: string;
  name: string;
  issueNumber: number;
}

/**
 * Remove the metadata row and its file. Returns the owning issue so the caller
 * can notify subscribers, or `undefined` when the id is unknown.
 */
export async function deleteAttachment(
  id: string,
): Promise<AttachmentTarget | undefined> {
  const row = getRow(id);
  if (!row) return undefined;
  db.delete(stateAttachment).where(eq(stateAttachment.id, id)).run();
  const full = absolutePath(row.storedPath);
  if (full) {
    try {
      await unlink(full);
    } catch {
      // The file may already be gone; the row is what matters.
    }
  }
  return { org: row.org, name: row.name, issueNumber: row.issueNumber };
}

function getRow(id: string): AttachmentRow | undefined {
  return db.select().from(stateAttachment).where(eq(stateAttachment.id, id)).get();
}
