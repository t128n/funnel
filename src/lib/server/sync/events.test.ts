import { afterEach, describe, expect, test } from "bun:test";
import { clientCount, publish, resetEventBus, subscribe } from "./events";

afterEach(() => {
  resetEventBus();
});

describe("event bus", () => {
  test("delivers published events to every subscriber", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    subscribe((e) => a.push(e));
    subscribe((e) => b.push(e));

    expect(clientCount()).toBe(2);
    publish({ type: "issues", repo: "orgA/core", numbers: [1, 2] });

    expect(a).toEqual([{ type: "issues", repo: "orgA/core", numbers: [1, 2] }]);
    expect(b).toHaveLength(1);
  });

  test("unsubscribe stops delivery and drops the client count", () => {
    const seen: unknown[] = [];
    const off = subscribe((e) => seen.push(e));
    off();
    publish({ type: "issues" });
    expect(seen).toEqual([]);
    expect(clientCount()).toBe(0);
  });

  test("a throwing listener does not break delivery to the others", () => {
    const seen: unknown[] = [];
    subscribe(() => {
      throw new Error("boom");
    });
    subscribe((e) => seen.push(e));
    expect(() => publish({ type: "issues" })).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});
