/**
 * Board drag-and-drop wiring (plan T9).
 *
 * The board uses `@atlaskit/pragmatic-drag-and-drop` rather than
 * `svelte-dnd-action` because the lanes are virtualized: a lane's DOM children
 * no longer map one-to-one onto its items, so a library that reorders DOM nodes
 * cannot know where a card belongs. Pragmatic instead tags the dragged element
 * with data and lets the lane compute the destination index from the rendered
 * card rectangles.
 *
 * The index is a *virtual* index (`data-board-card-index`), not a position in
 * the rendered window, so a drop lands in the right place even when the lane is
 * scrolled. Everything in {@link dropIndexAt} is pure and testable; only the
 * two actions touch the DOM.
 */
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

/** Drag data type of a board card. */
export const CARD_DRAG_TYPE = "board-card";

/** Drag data type of a lane drop target. */
export const LANE_DRAG_TYPE = "board-lane";

/** Data attached to a dragged board card. */
export interface CardDragData extends Record<string | symbol, unknown> {
  type: typeof CARD_DRAG_TYPE;
  /** `owner/name#number`, matching `data-board-card`. */
  issueKey: string;
  /** Lane the card was picked up from. */
  columnKey: string;
}

/** Data attached to a lane drop target. */
export interface LaneDropData extends Record<string | symbol, unknown> {
  type: typeof LANE_DRAG_TYPE;
  columnKey: string;
}

/** The rendered cards a lane uses to resolve a pointer position. */
export interface DropCardRect {
  /** Virtual index of the card within the loaded lane. */
  index: number;
  /** Viewport coordinates of the rendered card. */
  top: number;
  bottom: number;
}

/** Build the drag payload for one card. */
export function cardData(issueKey: string, columnKey: string): CardDragData {
  return { type: CARD_DRAG_TYPE, issueKey, columnKey };
}

/** Build the drop payload for one lane. */
export function laneData(columnKey: string): LaneDropData {
  return { type: LANE_DRAG_TYPE, columnKey };
}

/** True when a drag payload belongs to a board card. */
export function isCardDragData(
  data: Record<string, unknown>,
): data is CardDragData {
  return data.type === CARD_DRAG_TYPE && typeof data.issueKey === "string";
}

/**
 * Resolve the insertion index for the pointer at `clientY`.
 *
 * Cards are compared by their vertical midpoint: above a card's midpoint means
 * "before that card", below the last card's midpoint means "after the last
 * card". `cards` must be in render (virtual index) order. An empty lane always
 * resolves to `0`.
 */
export function dropIndexAt(
  clientY: number,
  cards: readonly DropCardRect[],
): number {
  if (cards.length === 0) return 0;
  for (const card of cards) {
    if (clientY < (card.top + card.bottom) / 2) return card.index;
  }
  return cards[cards.length - 1].index + 1;
}

/**
 * Read the rendered card rectangles under `root`, tagged with their *virtual*
 * index.
 *
 * The virtual index lives on the card's `[data-board-card-index]` wrapper (the
 * card inside the lane is virtualized, so its DOM position is not its item
 * index); `data-board-card` alone cannot resolve a slot. Result is sorted by
 * index so a mid-drag reorder cannot leave the comparison order stale.
 */
export function collectCardRects(root: ParentNode): DropCardRect[] {
  const cards: DropCardRect[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    "[data-board-card]",
  )) {
    const rect = element.getBoundingClientRect();
    const holder = element.closest<HTMLElement>("[data-board-card-index]");
    const raw = Number(
      holder?.dataset.boardCardIndex ?? element.dataset.boardCardIndex,
    );
    cards.push({
      index: Number.isFinite(raw) ? raw : 0,
      top: rect.top,
      bottom: rect.bottom,
    });
  }
  return cards.sort((a, b) => a.index - b.index);
}

/** Cleanup returned by every Svelte action here. */
export interface ActionHandle {
  destroy(): void;
}

/**
 * Make a board card draggable. `null` (a read-only board) leaves the element
 * untouched and still returns a valid action handle.
 */
export function draggableCard(
  node: HTMLElement,
  data: CardDragData | null,
): ActionHandle {
  if (!data) return { destroy() {} };

  const wasDraggable = node.draggable;
  node.draggable = true;

  const cleanup = draggable({
    element: node,
    getInitialData: () => data,
  });

  return {
    destroy() {
      cleanup();
      node.draggable = wasDraggable;
    },
  };
}

/** Callbacks a lane needs from its column component. */
export interface LaneHandlers {
  columnKey: string;
  /** Called once per successful drop with the virtual insertion index. */
  onDrop: (issueKey: string, index: number) => void;
  /** Report the current insertion index, or `null` when not hovering. */
  onIndicator?: (index: number | null) => void;
  /** Extra gate for drops (e.g. read-only boards). */
  canDrop?: () => boolean;
}

/**
 * Make a lane's scroll container a drop target. The rendered cards are read
 * from `[data-board-card]` on each pointer move so virtualization and page
 * appends are picked up without re-registering the target.
 *
 * Auto-scroll is attached to the same element: dragging near an edge scrolls
 * the lane and, as new cards mount, the resolved index keeps advancing.
 */
export function droppableLane(
  node: HTMLElement,
  handlers: LaneHandlers,
): ActionHandle & { update(next: LaneHandlers): void } {
  let current = handlers;
  let over = false;
  let lastClientY: number | null = null;

  const setIndicator = (index: number | null) => current.onIndicator?.(index);

  function renderedCards(): DropCardRect[] {
    return collectCardRects(node);
  }

  function indexAt(clientY: number): number {
    return dropIndexAt(clientY, renderedCards());
  }

  const cleanupDropTarget = dropTargetForElements({
    element: node,
    getData: () => laneData(current.columnKey),
    canDrop: ({ source }) =>
      isCardDragData(source.data) && (current.canDrop?.() ?? true),
    onDragEnter: ({ source, location }) => {
      if (!isCardDragData(source.data)) return;
      over = true;
      lastClientY = location.current.input.clientY;
      setIndicator(indexAt(lastClientY));
    },
    onDrag: ({ source, location }) => {
      if (!isCardDragData(source.data)) return;
      over = true;
      lastClientY = location.current.input.clientY;
      setIndicator(indexAt(lastClientY));
    },
    onDragLeave: ({ source }) => {
      if (!isCardDragData(source.data)) return;
      over = false;
      setIndicator(null);
    },
    onDrop: ({ source, location }) => {
      over = false;
      setIndicator(null);
      if (!isCardDragData(source.data)) return;
      const clientY = location.current.input.clientY;
      current.onDrop(source.data.issueKey, indexAt(clientY));
    },
  });

  const cleanupAutoScroll = autoScrollForElements({
    element: node,
    canScroll: ({ source }) => isCardDragData(source.data),
  });

  // A drop outside every lane still ends the drag; make sure no lane keeps a
  // stale indicator when that happens.
  const cleanupMonitor = monitorForElements({
    onDrop: () => {
      over = false;
      setIndicator(null);
    },
  });

  // Auto-scroll moves the cards under a stationary pointer, so resolve the
  // index again on scroll rather than only on pointer movement.
  function handleScroll() {
    if (!over || lastClientY === null) return;
    setIndicator(indexAt(lastClientY));
  }
  node.addEventListener("scroll", handleScroll, { passive: true });

  return {
    destroy() {
      node.removeEventListener("scroll", handleScroll);
      cleanupDropTarget();
      cleanupAutoScroll();
      cleanupMonitor();
      setIndicator(null);
    },
    update(next: LaneHandlers) {
      current = next;
    },
  };
}
