import { describe, expect, test } from "bun:test";
import { weekHeadline } from "./format";

describe("period labels", () => {
	test("weekHeadline names the Monday week", () => {
		expect(weekHeadline("2026-11-02")).toBe("Week of 2 Nov 2026");
		expect(weekHeadline("2026-02-30")).toBe("2026-02-30");
	});
});
