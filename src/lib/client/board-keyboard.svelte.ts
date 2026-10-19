/**
 * Board keyboard move mode (plan T10).
 *
 * With the lanes virtualized, keyboard moves cannot rely on DOM reordering —
 * the card being moved may not even be mounted. This module therefore owns the
 * *data* side of the interaction: `Space` on the focused card enters move mode,
 * the arrow keys mutate the board's drag-owned lane copy, and `Space`/`Enter`
 * commits while `Escape` restores the snapshot. Only a lane change reaches the
 * server (through `onCommit` → `moveToStatus`); a same-lane reorder stays local.
 *
 * The component layer keeps every DOM concern: focus, scrolling, and the
 * `aria-live` announcement all read the reactive {@link KeyboardMove} state but
 * are driven from `StatusBoard`.
 */
import type { IssueListItem } from "#lib/server/issues/types";

/** Directions the move mode understands. */
export type MoveDirection = "up" | "down" | "left" | "right";

/** A lane as the move mode sees it: identity plus a human label. */
export interface KeyboardLane {
  key: string;
  label: string;
}

/** Everything the reducer needs from the board component. */
export interface KeyboardMoveInput {
  /** Current lanes (the board's drag-owned copy). */
  zones: () => Record<string, IssueListItem[]>;
  /** Replace the lanes after a local move. */
  setZones: (zones: Record<string, IssueListItem[]>) => void;
  /** Lanes in visual order (the backlog view is not a lane). */
  columns: () => readonly KeyboardLane[];
  /** Card key that currently owns the roving tab stop. */
  activeKey: () => string | null;
  /** Move the roving tab stop onto a card. */
  setActiveKey: (key: string | null) => void;
  /** Card identity; defaults to `owner/name#number`. */
  keyOf?: (issue: IssueListItem) => string;
  /** Called on commit, once, only when the card changed lane. */
  onCommit?: (issue: IssueListItem, fromColumn: string, toColumn: string) => void;
}

/** Reactive handle over the keyboard move session. */
export interface KeyboardMove {
  /** True while a card is picked up. */
  readonly active: boolean;
  /** Key of the card being moved, or `null`. */
  readonly key: string | null;
  /** Lane the card currently sits in, or `null`. */
  readonly column: string | null;
  /** Last announcement for the `aria-live` region. */
  readonly message: string;
  /** Pick up the card at `cardKey` (no-op when unknown or already active). */
  start(cardKey: string): void;
  /** Reorder within the lane, or move across lanes. */
  move(direction: MoveDirection): void;
  /** Drop: writes the lane change, then leaves move mode. */
  commit(): void;
  /** Restore the pre-move snapshot; writes nothing. */
  cancel(): void;
  /** Handle one key event; returns whether move mode consumed it. */
  handleKey(event: KeyboardEvent): boolean;
}

/** Default card identity, matching `data-board-card`. */
function defaultKeyOf(issue: IssueListItem): string {
  return `${issue.repo}#${issue.number}`;
}

interface Location {
  column: string;
  index: number;
}

/**
 * Create the move-mode reducer. Call during component init (it allocates
 * runes); the returned getters stay reactive inside the owning component.
 */
export function createKeyboardMove(input: KeyboardMoveInput): KeyboardMove {
  const keyOf = input.keyOf ?? defaultKeyOf;

  let active = $state(false);
  let key = $state<string | null>(null);
  let column = $state<string | null>(null);
  let index = $state(0);
  let message = $state("");

  /** Exact pre-move lanes, restored on `Escape`. */
  let snapshot: Record<string, IssueListItem[]> | null = null;
  let origin: Location | null = null;

  function clone(
    zones: Record<string, IssueListItem[]>,
  ): Record<string, IssueListItem[]> {
    const next: Record<string, IssueListItem[]> = {};
    for (const [lane, items] of Object.entries(zones)) next[lane] = items.slice();
    return next;
  }

  function locate(cardKey: string): Location | null {
    for (const [lane, items] of Object.entries(input.zones())) {
      const at = items.findIndex((item) => keyOf(item) === cardKey);
      if (at >= 0) return { column: lane, index: at };
    }
    return null;
  }

  function labelOf(lane: string): string {
    return input.columns().find((entry) => entry.key === lane)?.label ?? lane;
  }

  function itemAt(location: Location): IssueListItem | undefined {
    return input.zones()[location.column]?.[location.index];
  }

  function announcePickup(location: Location): void {
    const issue = itemAt(location);
    if (!issue) return;
    const length = input.zones()[location.column]?.length ?? 0;
    message = `Picked up ${issue.repo}#${issue.number}. Position ${
      location.index + 1
    } of ${length} in ${labelOf(location.column)}.`;
  }

  function start(cardKey: string): void {
    if (active) return;
    const at = locate(cardKey);
    if (!at) return;
    snapshot = clone(input.zones());
    origin = at;
    key = cardKey;
    column = at.column;
    index = at.index;
    active = true;
    input.setActiveKey(cardKey);
    announcePickup(at);
  }

  function move(direction: MoveDirection): void {
    if (!active || !key || column === null) return;
    const zones = clone(input.zones());
    const lane = zones[column];
    if (!lane) return;
    const issue = lane[index];
    if (!issue) return;

    if (direction === "up" || direction === "down") {
      const delta = direction === "up" ? -1 : 1;
      const target = Math.max(0, Math.min(lane.length - 1, index + delta));
      if (target === index) return;
      lane.splice(index, 1);
      lane.splice(target, 0, issue);
      index = target;
      input.setZones(zones);
      input.setActiveKey(key);
      message = `${labelOf(column)}, position ${target + 1} of ${lane.length}.`;
      return;
    }

    const lanes = input.columns();
    const at = lanes.findIndex((entry) => entry.key === column);
    const step = direction === "right" ? 1 : -1;
    const next = lanes[at + step];
    if (!next) return;

    lane.splice(index, 1);
    const targetLane = zones[next.key] ?? (zones[next.key] = []);
    // Clamp to the loaded window: the tail beyond it has not been fetched.
    const targetIndex = Math.max(0, Math.min(index, targetLane.length));
    targetLane.splice(targetIndex, 0, issue);
    column = next.key;
    index = targetIndex;
    input.setZones(zones);
    input.setActiveKey(key);
    message = `${next.label}, position ${targetIndex + 1} of ${targetLane.length}.`;
  }

  function commit(): void {
    if (!active || !key || column === null) return;
    const moved = itemAt({ column, index });
    const from = origin?.column ?? column;
    const changed = from !== column;
    active = false;
    origin = null;
    snapshot = null;
    input.setActiveKey(key);
    if (changed && moved) input.onCommit?.(moved, from, column);
    message = `Dropped in ${labelOf(column)}.`;
  }

  function cancel(): void {
    if (!active) return;
    const original = snapshot;
    const back = origin;
    active = false;
    snapshot = null;
    origin = null;
    if (original) input.setZones(original);
    if (back) {
      column = back.column;
      index = back.index;
    }
    input.setActiveKey(key);
    message = `Move cancelled. Returned to ${back ? labelOf(back.column) : ""}.`;
  }

  function handleKey(event: KeyboardEvent): boolean {
    if (!active) return false;
    switch (event.key) {
      case "ArrowUp":
        move("up");
        return true;
      case "ArrowDown":
        move("down");
        return true;
      case "ArrowLeft":
        move("left");
        return true;
      case "ArrowRight":
        move("right");
        return true;
      case " ":
      case "Enter":
        commit();
        return true;
      case "Escape":
        cancel();
        return true;
      default:
        return false;
    }
  }

  return {
    get active() {
      return active;
    },
    get key() {
      return key;
    },
    get column() {
      return column;
    },
    get message() {
      return message;
    },
    start,
    move,
    commit,
    cancel,
    handleKey,
  };
}
