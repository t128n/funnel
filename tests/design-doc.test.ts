import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const doc = readFileSync(join(root, "docs/DESIGN.md"), "utf8");
const referencePath = join(root, "docs/reference/primitives.md");

const families = [
	"alert",
	"avatar",
	"badge",
	"bubble",
	"button",
	"card",
	"code-block",
	"collapsible",
	"command",
	"dialog",
	"dropdown-menu",
	"empty",
	"field",
	"input",
	"input-group",
	"item",
	"kbd",
	"label",
	"message",
	"native-select",
	"popover",
	"select",
	"separator",
	"sheet",
	"sidebar",
	"sonner",
	"spinner",
	"textarea",
	"toggle",
	"toggle-group",
	"tooltip",
];

describe("DESIGN.md", () => {
	test("documents the Bugzilla palette", () => {
		expect(doc).toContain("#0060df");
		expect(doc).toContain("--primary");
		expect(doc).toContain("--comment-reporter");
	});

	test("documents the shared primitives", () => {
		expect(doc).toContain(".bug-table");
		expect(doc).toContain(".bug-meta");
		expect(doc).toContain(".bug-comment");
		expect(doc).toContain(".bug-chrome");
		expect(doc).toContain(".flag");
		expect(doc).toContain(".link");
	});

	test("uses Bugzilla vocabulary", () => {
		expect(doc).toContain("UNCONFIRMED");
		expect(doc).toContain("P1");
	});

	test("carries no leftovers from the previous palette", () => {
		expect(doc).not.toContain("#5e6ad2");
		expect(doc).not.toContain("Linear");
	});

	test("documents primitives", () => {
		expect(doc).toContain("#lib/components/primitives");
		expect(doc).toContain("rounded-xs");
		expect(doc).not.toContain("shadcn");
	});

	test("keeps one radius rule", () => {
		expect(doc).toContain("`0` for table cells");
		expect(doc).toContain("`2px` (`rounded-xs`) for controls");
		expect(doc).toContain("`4px` (`rounded-lg`) for cards, popovers and dialogs");
		expect(doc).toContain("`rounded-full`");
		expect(doc).not.toContain("Radius `0` for cells, inputs, buttons and selects");
	});

	test("points new surfaces at the primitives namespace", () => {
		expect(doc).toContain("#lib/components/primitives/<family>");
		expect(doc).toContain("docs/reference/primitives.md");
	});
});

describe("reference/primitives.md", () => {
	test("exists", () => {
		expect(existsSync(referencePath)).toBe(true);
	});

	test("documents every primitive with its import path", () => {
		const reference = readFileSync(referencePath, "utf8");
		for (const family of families) {
			expect(reference).toContain(`#lib/components/primitives/${family}`);
		}
	});

	test("carries no shadcn or tailwind-variants references", () => {
		const reference = readFileSync(referencePath, "utf8");
		expect(reference.toLowerCase()).not.toContain("shadcn");
		expect(reference).not.toContain("tailwind-variants");
	});
});
