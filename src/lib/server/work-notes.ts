/**
 * Internal work notes (ITSM-style journal), Funnel-owned durable state.
 *
 * Unlike GitHub comments, a work note is never posted upstream unless the user
 * explicitly publishes it: it lives only in `state_work_note`, keyed by
 * `org/name` + issue number so it survives mirror pruning and re-sync (see
 * `db/schema.ts`). The author's identity is snapshotted into the row so the note
 * still renders after the mirror user table is rebuilt.
 *
 * This module owns the pure persistence primitives; the HTTP layer resolves the
 * author from the session and publishes an SSE event after each write.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateWorkNote } from "#lib/server/db/schema";
import type { UserRef, WorkNoteItem } from "#lib/server/issues/types";

type WorkNoteRow = typeof stateWorkNote.$inferSelect;

function toItem(row: WorkNoteRow): WorkNoteItem {
  const author: UserRef | null = row.authorLogin
    ? {
        externalId: row.authorExternalId ?? "",
        forge: row.authorForge,
        instance: row.authorInstance,
        login: row.authorLogin,
        avatarUrl: row.authorAvatarUrl,
      }
    : null;
  return {
    id: row.id,
    author,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CreateWorkNoteInput {
  org: string;
  name: string;
  issueNumber: number;
  /** Snapshot of the signed-in viewer; `null` when no identity is available. */
  author: UserRef | null;
  body: string;
}

/** Persist a new work note and return it (`createdAt` = now, unix ms). */
export function createWorkNote(input: CreateWorkNoteInput): WorkNoteItem {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.insert(stateWorkNote)
    .values({
      id,
      org: input.org,
      name: input.name,
      issueNumber: input.issueNumber,
      authorExternalId: input.author?.externalId ?? null,
      authorForge: input.author?.forge ?? "",
      authorInstance: input.author?.instance ?? "",
      authorLogin: input.author?.login ?? "",
      authorAvatarUrl: input.author?.avatarUrl ?? "",
      body: input.body,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return toItem(getRow(id) as WorkNoteRow);
}

/** Every work note for one issue, oldest first. */
export function listWorkNotes(
  org: string,
  name: string,
  issueNumber: number,
): WorkNoteItem[] {
  return db
    .select()
    .from(stateWorkNote)
    .where(
      and(
        eq(stateWorkNote.org, org),
        eq(stateWorkNote.name, name),
        eq(stateWorkNote.issueNumber, issueNumber),
      ),
    )
    .orderBy(asc(stateWorkNote.createdAt))
    .all()
    .map(toItem);
}

export function getWorkNote(id: string): WorkNoteItem | undefined {
  const row = getRow(id);
  return row ? toItem(row) : undefined;
}

/** Replace a note's body. Returns the updated note, or `undefined` if missing. */
export function updateWorkNote(
  id: string,
  body: string,
): WorkNoteItem | undefined {
  const result = db
    .update(stateWorkNote)
    .set({ body, updatedAt: Date.now() })
    .where(eq(stateWorkNote.id, id))
    .run();
  if (result.changes === 0) return undefined;
  const row = getRow(id);
  return row ? toItem(row) : undefined;
}

/** Hard-delete a note. Returns whether a row was actually removed. */
export function deleteWorkNote(id: string): boolean {
  return db.delete(stateWorkNote).where(eq(stateWorkNote.id, id)).run().changes > 0;
}

/** The issue a note belongs to, for SSE invalidation and publish targeting. */
export interface WorkNoteTarget {
  org: string;
  name: string;
  issueNumber: number;
}

export function workNoteTarget(id: string): WorkNoteTarget | undefined {
  const row = getRow(id);
  if (!row) return undefined;
  return { org: row.org, name: row.name, issueNumber: row.issueNumber };
}

function getRow(id: string): WorkNoteRow | undefined {
  return db.select().from(stateWorkNote).where(eq(stateWorkNote.id, id)).get();
}
