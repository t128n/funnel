import { expect, test } from "bun:test";
import { statSync } from "node:fs";

test("matrix and guidance screenshots exist", () => {
  for (const path of [
    "docs/assets/screenshots/matrix-light.png",
    "docs/assets/screenshots/matrix-dark.png",
    "docs/assets/screenshots/priority-guidance-light.png",
  ]) {
    expect(statSync(path).size).toBeGreaterThan(1000);
  }
});
