/**
 * Keyset (cursor) pagination for the issue feeds (SPEC §9.4, plan T1).
 *
 * Feeds page by an opaque cursor rather than an offset so that inserts and
 * updates between requests can never drop or duplicate a row. The cursor
 * carries the full sort tuple plus a signature of the filter that produced it;
 * a cursor presented against a different filter is rejected rather than
 * silently applied.
 *
 * Sort order (fixed): priority rank ASC (`p1`..`p3`, unprioritized last), then
 * `updatedAt` DESC, then `repoId` DESC, then `number` DESC. That tuple is
 * total — `(repoId, number)` is the mirror's primary key — so page walking has
 * no gaps or duplicates.
 */
import { createHash } from "node:crypto";
import type { BoardColumn } from "./types";
import type { IssueFilter } from "./filters";

/** Default page size for the Issues and Inbox feeds (plan: page size 100). */
export const ISSUE_PAGE_SIZE = 100;

/** Default page size for each status-board lane (plan: 50 per lane). */
export const BOARD_PAGE_SIZE = 50;

/** Hard cap on a requested page, so a bad `limit` cannot load the world. */
export const MAX_PAGE_SIZE = 500;

/**
 * The sort tuple a cursor resumes from:
 * `[priority rank, updatedAt, repoId, number]`.
 */
export type CursorKey = [number, number, number, number];

/** One page of a feed. `total` always comes from the server. */
export interface ListPage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

/** Options accepted by every paged read. */
export interface PageOptions {
  /** Rows per page; defaults per feed, clamped to {@link MAX_PAGE_SIZE}. */
  limit?: number;
  /** Cursor returned by a previous page, or `null`/absent for the first. */
  cursor?: string | null;
}

/**
 * A board column with its server-computed total and lane cursor. Structurally
 * a superset of {@link BoardColumn}, so it satisfies the existing board DTO.
 */
export interface BoardColumnPage extends BoardColumn {
  total: number;
  nextCursor: string | null;
}

/** The status board with per-lane totals and cursors. */
export interface PagedStatusBoard {
  columns: BoardColumnPage[];
}

/**
 * A stable, opaque signature of a filter (plus an optional discriminator such
 * as the board column or the viewer id). Array dimensions are sorted so that
 * `?repo=a&repo=b` and `?repo=b&repo=a` share a signature.
 */
export function filterSignature(filter: IssueFilter, extra?: string): string {
  const canonical = JSON.stringify({
    repos: [...filter.repos].sort((a, b) => a - b),
    states: [...filter.states].sort(),
    statuses: [...filter.statuses].sort(),
    assignees: [...filter.assignees].sort(),
    priorities: [...filter.priorities].sort(),
    sizes: [...filter.sizes].sort(),
    labels: [...filter.labels].sort(),
    milestones: filter.milestones
      .map((m) => `${m.repoId}#${m.number}`)
      .sort(),
    noMilestone: filter.noMilestone,
    search: filter.search,
    extra: extra ?? null,
  });
  return createHash("sha256").update(canonical).digest("base64url");
}

/** Encode a sort tuple for `signature` as a base64url cursor. */
export function encodeCursor(signature: string, key: CursorKey): string {
  const payload = JSON.stringify({ v: 1, f: signature, k: key });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/**
 * Decode a cursor, returning `null` when it is malformed or was produced for a
 * different filter (mismatched signature). Callers treat `null` as "first
 * page" rather than erroring, so a stale link never breaks navigation.
 */
export function decodeCursor(
  cursor: string,
  signature: string,
): CursorKey | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, f, k } = parsed as { v?: unknown; f?: unknown; k?: unknown };
  if (v !== 1 || f !== signature) return null;
  if (!Array.isArray(k) || k.length !== 4) return null;
  if (!k.every((part) => typeof part === "number" && Number.isInteger(part))) {
    return null;
  }
  return [k[0], k[1], k[2], k[3]];
}

/** Clamp a requested page size against a feed default and the hard cap. */
export function pageLimit(limit: number | undefined, defaultSize: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return defaultSize;
  const floored = Math.floor(limit);
  if (floored < 1) return 1;
  return Math.min(floored, MAX_PAGE_SIZE);
}
