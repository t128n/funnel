import { describe, expect, it } from "bun:test";
import { cardData, dropIndexAt, laneData } from "./dnd";

const card = (index: number, top: number, bottom: number) => ({
  index,
  top,
  bottom,
});

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
