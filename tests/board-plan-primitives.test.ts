import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * T11 source contracts: the board, plan, epics, attention, milestones and
 * notifications surfaces consume the owned primitives, keep their drag/dialog
 * protocol, and colour severity only through design tokens.
 *
 * Bun has no Svelte loader, so these are source reads, the same shape as
 * `board-card.test.ts` and `issue-primitives.test.ts`.
 */
const root = join(import.meta.dir, "..");

function read(relative: string): string {
	return readFileSync(join(root, relative), "utf8");
}

function svelteFilesUnder(relative: string): string[] {
	const absolute = join(root, relative);
	const files: string[] = [];
	for (const entry of readdirSync(absolute)) {
		const path = join(absolute, entry);
		if (statSync(path).isDirectory()) {
			files.push(...svelteFilesUnder(join(relative, entry)));
		} else if (entry.endsWith(".svelte")) {
			files.push(join(relative, entry));
		}
	}
	return files;
}

const ownedSources = [
	...svelteFilesUnder("src/lib/components/board"),
	...svelteFilesUnder("src/lib/components/plan"),
	...svelteFilesUnder("src/lib/components/epics"),
	...svelteFilesUnder("src/lib/components/attention"),
	...svelteFilesUnder("src/routes/(app)/board"),
	...svelteFilesUnder("src/routes/(app)/plan"),
	...svelteFilesUnder("src/routes/(app)/epics"),
	...svelteFilesUnder("src/routes/(app)/milestones"),
	...svelteFilesUnder("src/routes/(app)/attention"),
	...svelteFilesUnder("src/routes/(app)/notifications")
].map((path) => ({ path, source: read(path) }));

/** Tailwind palette utilities are banned: colour comes from a token only. */
const PALETTE = /(?:^|[\s:"'])(?:bg|text|border|ring|fill|stroke|outline)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/;

describe("board uses primitives", () => {
	test("BoardCard imports the primitive layer and never the old ui alias", () => {
		const source = read("src/lib/components/board/BoardCard.svelte");
		expect(source).toContain("#lib/components/primitives/");
		expect(source).not.toContain("components/ui/");
	});

	test("every owned surface drops the old ui alias", () => {
		expect(ownedSources.length).toBeGreaterThan(20);
		for (const { path, source } of ownedSources) {
			expect({ path, ui: source.includes("components/ui/") }).toEqual({ path, ui: false });
		}
	});

	test("board, plan, epics and attention components use the primitives", () => {
		const expected = [
			"src/lib/components/board/BoardCard.svelte",
			"src/lib/components/board/BoardShortcuts.svelte",
			"src/lib/components/board/BlockActionDialog.svelte",
			"src/lib/components/plan/ScheduleDialog.svelte",
			"src/lib/components/plan/DayPlan.svelte",
			"src/lib/components/epics/AddChildDialog.svelte",
			"src/lib/components/attention/AttentionRow.svelte",
			"src/routes/(app)/plan/+page.svelte",
			"src/routes/(app)/notifications/+page.svelte"
		];
		for (const path of expected) {
			expect({ path, primitives: read(path).includes("#lib/components/primitives/") }).toEqual({
				path,
				primitives: true
			});
		}
	});

	test("milestones and notifications render empty states through the primitive", () => {
		for (const path of [
			"src/routes/(app)/milestones/+page.svelte",
			"src/routes/(app)/notifications/+page.svelte",
			"src/routes/(app)/epics/+page.svelte"
		]) {
			expect({ path, empty: read(path).includes("Empty.Root") }).toEqual({ path, empty: true });
		}
	});
});

describe("insertion line", () => {
	const column = read("src/lib/components/board/BoardColumn.svelte");

	test("the drop indicator is a 2px primary line", () => {
		expect(column).toContain("data-board-drop-indicator");
		expect(column).toContain("bg-primary");
		expect(column).toContain("h-0.5");
	});

	test("the indicator is positioned from the virtual drop index", () => {
		expect(column).toContain("indicatorTop");
		expect(column).toContain("getItemOffset(indicator)");
	});
});

describe("the data tables keep the bug-table idiom", () => {
	test("epic children and milestones still render a bug-table", () => {
		expect(read("src/lib/components/epics/EpicChildTable.svelte")).toContain('class="bug-table"');
		expect(read("src/routes/(app)/milestones/+page.svelte")).toContain("bug-table");
	});
});

describe("empty lanes keep their header and height", () => {
	const column = read("src/lib/components/board/BoardColumn.svelte");

	test("the header is not inside the empty branch", () => {
		const header = column.indexOf("<header");
		const empty = column.indexOf("{#if empty}");
		expect(header).toBeGreaterThan(-1);
		expect(empty).toBeGreaterThan(header);
		expect(column).toContain("No issues");
	});

	test("the lane stays a stretched bordered column", () => {
		expect(column).toContain("flex-col");
		expect(column).toContain("min-h-0");
		expect(column).toContain("flex-1");
		expect(column).toContain("h-7 shrink-0");
	});
});

describe("drag payload and dialog mutations are unchanged", () => {
	test("cards carry the same drag payload", () => {
		const card = read("src/lib/components/board/BoardCard.svelte");
		expect(card).toContain("use:draggableCard={dragPayload}");
		expect(card).toContain("cardData(key, columnKey)");
		expect(card).toContain("data-board-card={key}");
	});

	test("lanes still accept drops and the board still commits status moves", () => {
		const column = read("src/lib/components/board/BoardColumn.svelte");
		const board = read("src/lib/components/board/StatusBoard.svelte");
		expect(column).toContain("use:droppableLane={laneHandlers}");
		expect(board).toContain("moveToStatus(moved, targetColumn)");
		expect(board).toContain("handleDrop(issueKey, column.key, index)");
	});

	test("the shared action dialogs stay wired to the card menu", () => {
		const dialog = read("src/lib/components/board/BlockActionDialog.svelte");
		const card = read("src/lib/components/board/BoardCard.svelte");
		expect(dialog).toContain("Dialog.Root");
		expect(dialog).toContain('variant="destructive"');
		expect(dialog).toContain("onconfirm");
		expect(card).toContain("moveToStatus(issue, value)");
		expect(card).toContain("requestBlock(issue)");
		expect(card).toContain("requestClose(issue)");
	});
});

describe("severity colour comes from the token", () => {
	test("capacity tones use warning, not a Tailwind palette colour", () => {
		const bar = read("src/lib/components/plan/CapacityBar.svelte");
		expect(bar).toContain("bg-destructive");
		expect(bar).toContain("bg-warning");
		expect(bar).not.toMatch(PALETTE);
	});

	test("attention and board severity use the flag tokens", () => {
		const row = read("src/lib/components/attention/AttentionRow.svelte");
		expect(row).toContain("flag-danger");
		expect(row).toContain("flag-warning");
		const board = read("src/lib/components/board/BoardColumn.svelte");
		expect(board).toContain("text-warning");
	});

	test("no owned surface hardcodes a palette colour", () => {
		for (const { path, source } of ownedSources) {
			expect({ path, palette: PALETTE.test(source) }).toEqual({ path, palette: false });
		}
	});
});

describe("call sites leave visual styling to the primitives", () => {
	test("owned surfaces no longer set focus rings themselves", () => {
		for (const { path, source } of ownedSources) {
			expect({ path, ring: source.includes("focus-visible:ring-") }).toEqual({
				path,
				ring: false
			});
		}
	});
});

describe("controls come from the primitives", () => {
	test("owned surfaces render no raw form controls", () => {
		for (const { path, source } of ownedSources) {
			expect({ path, input: /<input\b/.test(source) }).toEqual({ path, input: false });
			expect({ path, textarea: /<textarea\b/.test(source) }).toEqual({ path, textarea: false });
			expect({ path, select: /<select\b/.test(source) }).toEqual({ path, select: false });
		}
	});

	test("the day grid's start-time editor is the Input primitive", () => {
		const day = read("src/lib/components/plan/DayPlan.svelte");
		const input = day.match(/<Input\b[\s\S]*?\/>/)?.[0] ?? "";
		expect(input).toContain('type="time"');
		expect(input).toContain("onchange");
		expect(input).not.toMatch(/border-input|bg-background|rounded-|text-2xs/);
	});
});

describe("dialog typography comes from the primitives", () => {
	const dialogs = [
		"src/lib/components/board/BlockActionDialog.svelte",
		"src/lib/components/plan/ScheduleDialog.svelte",
		"src/lib/components/epics/AddChildDialog.svelte"
	];

	test("titles and descriptions carry no call-site typography", () => {
		for (const path of dialogs) {
			const source = read(path);
			for (const tag of ["Dialog.Title", "Dialog.Description"]) {
				const opening = source.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? "";
				expect({ path, tag, class: opening.includes("class=") }).toEqual({
					path,
					tag,
					class: false
				});
			}
		}
	});
});

describe("the recheck chips pick the secondary variant", () => {
	test("selected re-check dates use secondary and the rest ghost", () => {
		const dialog = read("src/lib/components/board/BlockActionDialog.svelte");
		expect(dialog).toContain("variant={recheck === option.value ? 'secondary' : 'ghost'}");
	});
});

describe("card actions and shortcuts are Buttons", () => {
	test("the board card exposes assign and menu actions as Button variants", () => {
		const card = read("src/lib/components/board/BoardCard.svelte");
		expect(card).toContain("<Button");
		expect(card).toContain('size="icon-xs"');
		expect(card).not.toMatch(/<button\b/);
	});

	test("the shortcuts trigger is a ghost Button", () => {
		const shortcuts = read("src/lib/components/board/BoardShortcuts.svelte");
		expect(shortcuts).toContain('variant="ghost" size="icon-sm"');
		expect(shortcuts).not.toMatch(/<button\b/);
	});

	test("the lane retry action is a Button", () => {
		const column = read("src/lib/components/board/BoardColumn.svelte");
		expect(column).toContain('variant="ghost" size="xs"');
		expect(column).toContain("onclick={onLoadMore}");
	});
});
