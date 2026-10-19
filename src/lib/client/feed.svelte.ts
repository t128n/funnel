/**
 * Client-side feed stores for paginated lists (Issues, Inbox, Board lanes).
 *
 * A feed owns one loaded window of rows. The first page always comes from the
 * server (a SvelteKit `load`); {@link Feed.loadMore} walks forward with the
 * keyset cursor and {@link Feed.sync} merges an authoritative first page into
 * the window without truncating the tail. SSE refreshes therefore keep the
 * user's scroll position: loaded rows survive, replaced rows keep their slot.
 *
 * Everything here is DOM-free and server-safe. `fetch` only runs from the
 * methods, and the stores are created during component init so the runes
 * inside them are owned by that component.
 */
import { appendUnique, mergeFirstPage } from "#lib/client/feed-merge";
import { feedUrl } from "#lib/feeds";

/** One page returned by a feed endpoint; mirrors the server's `ListPage`. */
export interface FeedPage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

/** Everything a feed needs to fetch its own next pages. */
export interface FeedConfig<T> {
  /** `GET` endpoint, e.g. `/api/feeds/issues`. */
  endpoint: string;
  /** The server-rendered first page. */
  initial: FeedPage<T>;
  /**
   * Identity of the current filter view. A changed key means "different
   * query": the next `sync` replaces the loaded window instead of merging.
   */
  key: () => string;
  /** Stable identity of one row, used for dedupe on merge/append. */
  itemKey: (item: T) => string;
  /** Filter parameters for the current view. */
  query: () => string | URLSearchParams;
  /** Endpoint-specific parameters (the board sends its lane here). */
  extra?: () => Record<string, string>;
  /** Override the server's default page size (the board uses 50). */
  limit?: number;
}

/** A reactive window over a paginated feed. */
export interface Feed<T> {
  /** Loaded rows, in server order, deduplicated by {@link FeedConfig.itemKey}. */
  readonly items: T[];
  /** Server total for the current filter, not the loaded count. */
  total: number;
  /** Cursor for the next unwalked page, or `null` at the end. */
  readonly nextCursor: string | null;
  /** True while a request is in flight. */
  readonly loading: boolean;
  /** Message of the last failed request, cleared by the next success. */
  readonly error: string | null;
  /** Merge (same view) or replace with (new view) an authoritative page. */
  sync(page: FeedPage<T>): void;
  /** Fetch the page after `nextCursor` and append it. */
  loadMore(): Promise<void>;
  /** Refetch the loaded window from the start, capped at 500 rows. */
  refreshLoaded(): Promise<void>;
}

/** Loaded-window refresh cap (plan: refetch at most 500 rows). */
const MAX_REFRESH = 500;

/** Extract a readable message from a failed request. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Could not load more rows";
}

/**
 * Create one feed store. Call during component init (it allocates runes).
 */
export function createFeed<T>(config: FeedConfig<T>): Feed<T> {
  let key = config.key();
  let items = $state<T[]>(config.initial.items.slice());
  let total = $state(config.initial.total);
  let nextCursor = $state<string | null>(config.initial.nextCursor);
  let loading = $state(false);
  let error = $state<string | null>(null);

  /** Guards against a stale response landing after a filter/view change. */
  let generation = 0;

  const itemKey = (item: unknown): string => config.itemKey(item as T);

  function params(): URLSearchParams {
    return new URLSearchParams(config.query());
  }

  function url(cursor: string | null, limit: number | undefined): string {
    return feedUrl(config.endpoint, params(), cursor, config.extra?.(), limit);
  }

  async function fetchPage(target: string): Promise<FeedPage<T>> {
    const response = await fetch(target, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      let detail = "";
      try {
        const body: unknown = await response.json();
        if (
          body !== null &&
          typeof body === "object" &&
          "message" in body &&
          typeof body.message === "string"
        ) {
          detail = body.message;
        }
      } catch {
        // Non-JSON error body: fall back to the status line.
      }
      throw new Error(detail || `Request failed (${response.status})`);
    }
    const body = (await response.json()) as Partial<FeedPage<T>> | null;
    if (body === null || !Array.isArray(body.items)) {
      throw new Error("Malformed feed response");
    }
    return {
      items: body.items,
      total: typeof body.total === "number" ? body.total : body.items.length,
      nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
    };
  }

  function sync(page: FeedPage<T>): void {
    const nextKey = config.key();
    if (nextKey === key) {
      // Authoritative rows replace their loaded copies in place; the tail stays.
      items = mergeFirstPage(items, page.items, itemKey);
    } else {
      // A different filter: the old window must not leak into the new one.
      key = nextKey;
      generation += 1;
      loading = false;
      items = page.items.slice();
    }
    total = page.total;
    nextCursor = page.nextCursor;
    error = null;
  }

  async function loadMore(): Promise<void> {
    if (loading || nextCursor === null) return;
    // Without a sync the cursor belongs to the previous view; never append it.
    if (config.key() !== key) return;
    const cursor = nextCursor;
    const request = ++generation;
    loading = true;
    error = null;
    try {
      const page = await fetchPage(url(cursor, config.limit));
      if (request !== generation || config.key() !== key) return;
      items = appendUnique(items, page.items, itemKey);
      total = page.total;
      nextCursor = page.nextCursor;
    } catch (cause) {
      if (request !== generation) return;
      // Keep the loaded rows and cursor so a retry resumes from the same page.
      error = messageOf(cause);
    } finally {
      if (request === generation) loading = false;
    }
  }

  async function refreshLoaded(): Promise<void> {
    if (loading) return;
    if (config.key() !== key) return;
    const limit = Math.min(Math.max(items.length, 1), MAX_REFRESH);
    const request = ++generation;
    loading = true;
    error = null;
    try {
      const page = await fetchPage(url(null, limit));
      if (request !== generation || config.key() !== key) return;
      sync(page);
    } catch (cause) {
      if (request !== generation) return;
      error = messageOf(cause);
    } finally {
      if (request === generation) loading = false;
    }
  }

  return {
    get items() {
      return items;
    },
    get total() {
      return total;
    },
    set total(value: number) {
      total = value;
    },
    get nextCursor() {
      return nextCursor;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    sync,
    loadMore,
    refreshLoaded,
  };
}

