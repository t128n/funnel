/**
 * Client board store (plan T8): one paginated {@link Feed} per workflow lane,
 * plus a projection that layers the optimistic overlays over the loaded cards.
 *
 * The board is five independent keyset feeds — WIP counts and cursors come from
 * the server, so a lane never needs all its cards loaded. `sync` merges an SSE
 * first page into each loaded lane window (keeping the user's scroll), and
 * {@link BoardFeed.board} re-buckets the loaded cards with `projectBoard` while
 * carrying each lane's `total`/`nextCursor`/`loading` through to the component
 * layer. Optimistic status changes adjust the source/target totals by the
 * loaded-card delta so headers move with the card.
 *
 * Everything here is DOM-free; the stores are allocated during component init.
 */
import { createFeed, type Feed, type FeedPage } from "#lib/client/feed.svelte";
import { laneOwners, movedToAnotherLane } from "#lib/client/feed-merge";
import {
  overlayRevisionValue,
  projectBoard,
} from "#lib/client/optimistic.svelte";
import { FEED_ENDPOINTS } from "#lib/feeds";
import type {
  BoardColumnPage,
  PagedStatusBoard,
} from "#lib/server/issues/pagination";
import type {
  IssueListItem,
  StatusBoard,
  StatusKey,
} from "#lib/server/issues/types";

/** Canonical lane order (SPEC §9.3). */
const STATUS_KEYS: readonly StatusKey[] = [
  "backlog",
  "todo",
  "in-progress",
  "in-review",
  "done",
];

/** Per-lane page size (plan: 50 per board lane). */
const BOARD_PAGE_SIZE = 50;

/** Lanes the board grid renders; Backlog is a separate list view. */
const BOARD_VIEW_KEYS = STATUS_KEYS.filter((key) => key !== "backlog");

/**
 * One lane as handed to the board components: the projected cards plus the
 * lane's server total, cursor, and fetch state (the `BoardColumnProps` shape).
 */
export interface BoardLane extends BoardColumnPage {
  loading: boolean;
  error: string | null;
  /** Fetch the next page for this lane (no-op while loading or at the end). */
  loadMore: () => void;
}

/** The projected board passed to `StatusBoard`. */
export interface BoardProjection {
  columns: BoardLane[];
  /**
   * Cheap identity of the rendered lanes' card arrays: changes only when a
   * lane's array is replaced (or an overlay re-buckets a card). The board
   * component re-seeds from this instead of joining every card key.
   */
  revision: number;
}

/** A board's five lane feeds and their derived projection. */
export interface BoardFeed {
  readonly columns: Record<StatusKey, Feed<IssueListItem>>;
  /** Sum of the server totals for every lane. */
  total(): number;
  /** Walk one lane forward by its own cursor. */
  loadMore(column: StatusKey): Promise<void>;
  /** Merge freshly loaded lane pages into the loaded windows. */
  sync(board: PagedStatusBoard): void;
  /** Projected lanes (optimistic re-bucketing) with fetch metadata attached. */
  board(): BoardProjection;
}

/** Identity of a board card: repo id plus issue number. */
function issueKey(item: IssueListItem): string {
  return `${item.repoId}:${item.number}`;
}

/**
 * Stable ids for lane arrays. Array identity is the cheap "content changed"
 * signal: the feeds replace their window only when rows actually change.
 */
const laneIds = new WeakMap<object, number>();
let nextLaneId = 1;

function laneId(items: readonly IssueListItem[]): number {
  let id = laneIds.get(items);
  if (id === undefined) {
    id = nextLaneId;
    nextLaneId += 1;
    laneIds.set(items, id);
  }
  return id;
}

/** Read one lane's page, tolerating a legacy column without page metadata. */
function columnPage(column: BoardColumnPage | undefined): FeedPage<IssueListItem> {
  if (!column) return { items: [], total: 0, nextCursor: null };
  return {
    items: column.issues ?? [],
    total: typeof column.total === "number" ? column.total : (column.issues?.length ?? 0),
    nextCursor: typeof column.nextCursor === "string" ? column.nextCursor : null,
  };
}

/**
 * Create the five lane feeds. Call during component init (it allocates runes).
 * `key` identifies the current filter query so a change resets every lane.
 */
export function createBoardFeed(
  initial: PagedStatusBoard,
  key: () => string,
): BoardFeed {
  const firstByKey = new Map<StatusKey, BoardColumnPage>(
    initial.columns.map((column) => [column.key, column]),
  );
  const labels = new Map<StatusKey, string>(
    initial.columns.map((column) => [column.key, column.label]),
  );

  const columns = {} as Record<StatusKey, Feed<IssueListItem>>;
  for (const statusKey of STATUS_KEYS) {
    columns[statusKey] = createFeed<IssueListItem>({
      endpoint: FEED_ENDPOINTS.board,
      initial: columnPage(firstByKey.get(statusKey)),
      key,
      itemKey: issueKey,
      query: () => new URLSearchParams(key()),
      limit: BOARD_PAGE_SIZE,
      extra: () => ({ column: statusKey }),
    });
  }

  function sync(board: PagedStatusBoard): void {
    const fresh = new Map<StatusKey, BoardColumnPage>(
      board.columns.map((column) => [column.key, column]),
    );
    for (const statusKey of STATUS_KEYS) {
      const column = fresh.get(statusKey);
      // A missing lane means the server omitted it, not that it emptied.
      if (!column) continue;
      labels.set(statusKey, column.label);
      columns[statusKey].sync(columnPage(column));
    }

    // A lane window can still hold a row from before a move when that row sits
    // beyond the first page. The other lanes' authoritative pages prove it has
    // left this one, so drop it before the projection reseeds.
    const owners = laneOwners(
      board.columns.map((column) => ({
        key: column.key,
        items: column.issues ?? [],
      })),
      issueKey,
    );
    for (const statusKey of BOARD_VIEW_KEYS) {
      columns[statusKey].retain(
        (issue) => !movedToAnotherLane(issueKey(issue), statusKey, owners),
      );
    }
  }

  function total(): number {
    return STATUS_KEYS.reduce((sum, lane) => sum + columns[lane].total, 0);
  }

  function loadMore(column: StatusKey): Promise<void> {
    return columns[column] ? columns[column].loadMore() : Promise.resolve();
  }

  /** Monotonic revision of the grid lanes' card content. */
  let projectionRevision = 0;
  let lastGridLaneIds: number[] = [];
  let lastOverlayRevision = -1;

  function revisionFor(gridLaneIds: number[], overlayVersion: number): number {
    let changed = overlayVersion !== lastOverlayRevision;
    if (!changed) {
      changed = gridLaneIds.length !== lastGridLaneIds.length;
    }
    if (!changed) {
      for (let index = 0; index < gridLaneIds.length; index += 1) {
        if (gridLaneIds[index] !== lastGridLaneIds[index]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      lastGridLaneIds = gridLaneIds;
      lastOverlayRevision = overlayVersion;
      projectionRevision += 1;
    }
    return projectionRevision;
  }

  function board(): BoardProjection {
    const raw: StatusBoard = {
      columns: STATUS_KEYS.map((statusKey) => ({
        key: statusKey,
        label: labels.get(statusKey) ?? statusKey,
        issues: columns[statusKey].items,
      })),
    };

    // `projectBoard` re-buckets loaded cards by their overlaid status; compare
    // the bucket sizes before/after to shift the server totals alongside them.
    const before = new Map<StatusKey, number>(
      STATUS_KEYS.map((statusKey) => [statusKey, columns[statusKey].items.length]),
    );
    const projected = projectBoard(raw);

    // Identity of the raw grid lane windows plus the overlay revision: the
    // projected arrays are re-allocated on every render, but their content only
    // changes with a lane refresh or an overlay. Backlog is a separate view.
    const gridLaneIds = BOARD_VIEW_KEYS.map((statusKey) =>
      laneId(columns[statusKey].items),
    );

    return {
      revision: revisionFor(gridLaneIds, overlayRevisionValue()),
      columns: projected.columns.map((column) => {
        const feed = columns[column.key];
        const delta = column.issues.length - (before.get(column.key) ?? 0);
        return {
          ...column,
          total: Math.max(0, feed.total + delta),
          nextCursor: feed.nextCursor,
          loading: feed.loading,
          error: feed.error,
          loadMore: () => {
            void feed.loadMore();
          },
        };
      }),
    };
  }

  return { columns, total, loadMore, sync, board };
}
