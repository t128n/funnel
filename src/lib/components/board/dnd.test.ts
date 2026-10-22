import { describe, expect, it } from "bun:test";
import { cardData, collectCardRects, dropIndexAt, laneData } from "./dnd";

const card = (index: number, top: number, bottom: number) => ({
  index,
  top,
  bottom,
});

/**
 * A card element whose virtual index lives on its `[data-board-card-index]`
 * wrapper (as `BoardColumn.svelte` renders it), not on the `[data-board-card]`
 * element itself.
 */
function cardElement(
  index: number | null,
  top: number,
  bottom: number,
  indexOnCard = false,
): HTMLElement {
  const wrapper =
    index === null ? null : { dataset: { boardCardIndex: String(index) } };
  return {
    getBoundingClientRect: () => ({ top, bottom }) as DOMRect,
    closest: () => (indexOnCard ? null : wrapper),
    dataset:
      indexOnCard && index !== null
        ? { boardCardIndex: String(index) }
        : ({} as DOMStringMap),
  } as unknown as HTMLElement;
}

function fakeRoot(elements: HTMLElement[]): ParentNode {
  return { querySelectorAll: () => elements } as unknown as ParentNode;
}

describe("dropIndexAt", () => {
  it("targets the start of an empty lane", () => {
    expect(dropIndexAt(400, [])).toBe(0);
  });

  it("targets the first slot when above the first card", () => {
    const cards = [card(0, 100, 140), card(1, 150, 190)];
    expect(dropIndexAt(80, cards)).toBe(0);
  });

  it("targets a card's own slot above its midpoint", () => {
    const cards = [card(0, 100, 140), card(1, 150, 190), card(2, 200, 240)];
    // Midpoints: 120, 170, 220.
    expect(dropIndexAt(119, cards)).toBe(0);
    expect(dropIndexAt(130, cards)).toBe(1);
    expect(dropIndexAt(169, cards)).toBe(1);
    expect(dropIndexAt(180, cards)).toBe(2);
  });

  it("targets the slot after the last card when below it", () => {
    const cards = [card(0, 100, 140), card(1, 150, 190)];
    expect(dropIndexAt(500, cards)).toBe(2);
  });

  it("keeps virtual indexes so scrolled lanes drop in the right slot", () => {
    const cards = [card(20, 100, 140), card(21, 150, 190)];
    expect(dropIndexAt(90, cards)).toBe(20);
    expect(dropIndexAt(500, cards)).toBe(22);
  });
});

describe("collectCardRects", () => {
  it("reads the virtual index from the card's wrapper, not the card element", () => {
    // The card element carries `data-board-card` but no index; the wrapper owns
    // `data-board-card-index`. Reading only the card would resolve every card
    // to index 0 and collapse drops into the first slot.
    const rects = collectCardRects(
      fakeRoot([cardElement(20, 100, 140), cardElement(21, 150, 190)]),
    );
    expect(rects).toEqual([
      { index: 20, top: 100, bottom: 140 },
      { index: 21, top: 150, bottom: 190 },
    ]);
  });

  it("sorts rects by virtual index regardless of DOM order", () => {
    const rects = collectCardRects(
      fakeRoot([cardElement(22, 300, 340), cardElement(20, 100, 140)]),
    );
    expect(rects.map((rect) => rect.index)).toEqual([20, 22]);
  });

  it("falls back to the card's own index, then 0 when unindexed", () => {
    expect(
      collectCardRects(fakeRoot([cardElement(7, 0, 10, true)])),
    ).toEqual([{ index: 7, top: 0, bottom: 10 }]);
    const [unindexed] = collectCardRects(fakeRoot([cardElement(null, 0, 10)]));
    expect(unindexed).toEqual({ index: 0, top: 0, bottom: 10 });
  });

  it("feeds dropIndexAt with the real virtual indexes", () => {
    const rects = collectCardRects(
      fakeRoot([cardElement(20, 100, 140), cardElement(21, 150, 190)]),
    );
    expect(dropIndexAt(80, rects)).toBe(20);
    expect(dropIndexAt(500, rects)).toBe(22);
  });
});

describe("drag data", () => {
  it("tags a card with its issue and source lane", () => {
    const data = cardData("org/web#7", "in-progress");
    expect(data).toEqual({
      type: "board-card",
      issueKey: "org/web#7",
      columnKey: "in-progress",
    });
  });

  it("tags a lane with its column", () => {
    const data = laneData("in-review");
    expect(data).toEqual({ type: "board-lane", columnKey: "in-review" });
  });
});
