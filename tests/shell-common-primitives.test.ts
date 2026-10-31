import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");

const owned = [
	"src/lib/components/app-sidebar.svelte",
	"src/lib/components/nav-user.svelte",
	"src/lib/components/nav/footer-nav.svelte",
	"src/lib/components/nav/nav-item.svelte",
	"src/lib/components/nav/nav-section.svelte",
	"src/lib/components/shell/DetailPlaceholder.svelte",
	"src/lib/components/shell/SplitView.svelte",
	"src/lib/components/common/Avatar.svelte",
	"src/lib/components/common/ErrorState.svelte",
	"src/lib/components/common/IntakeTag.svelte",
	"src/lib/components/common/MultiSelect.svelte",
	"src/lib/components/common/PageHead.svelte",
	"src/lib/components/common/PriorityIcon.svelte",
	"src/lib/components/common/SegmentedControl.svelte",
	"src/lib/components/common/select-trigger.ts",
	"src/lib/components/common/SingleSelect.svelte",
	"src/lib/components/common/Spinner.svelte",
	"src/lib/components/common/StatusIcon.svelte",
	"src/lib/components/detail/Composer.svelte",
	"src/lib/components/detail/DetailShell.svelte",
	"src/lib/components/filter/FeedSearch.svelte",
	"src/lib/components/filter/FilterPopover.svelte",
	"src/lib/components/filter/ViewSegment.svelte",
	"src/lib/components/hotkeys/Hint.svelte",
	"src/lib/components/markdown/CodeBlock.svelte",
	"src/routes/+layout.svelte",
	"src/routes/(app)/+layout.svelte"
];

describe("shell and common primitives", () => {
	test("shell and common use primitives", () => {
		for (const file of [
			"src/lib/components/app-sidebar.svelte",
			"src/lib/components/common/SingleSelect.svelte",
			"src/lib/components/detail/Composer.svelte"
		]) {
			const source = read(file);
			expect(source, file).toContain("primitives/");
			expect(source, file).not.toContain("components/ui/");
		}
	});

	test("trigger helper delegates to the shared recipe", () => {
		const source = read("src/lib/components/common/select-trigger.ts");
		expect(source).toContain("triggerClass");
		expect(source).toContain("triggerChevron");
		expect(source).not.toContain("rounded-[min(var(--radius-md),10px)]");
	});

	test("owned surfaces carry no shadcn namespace or theme chrome", () => {
		for (const file of owned) {
			const source = read(file);
			expect(source, file).not.toContain("components/ui/");
			expect(source, file).not.toMatch(/\bdark:/);
			expect(source, file).not.toMatch(/\brounded-(?:lg|md|xl|2xl|3xl|4xl)\b/);
		}
	});

	test("composer is the ghost inline editor", () => {
		const source = read("src/lib/components/detail/Composer.svelte");
		expect(source).toContain('variant="ghost"');
		expect(source).not.toContain("focus-visible]:ring-0");
	});

	test("count badges are primitive badges, not pills", () => {
		const source = read("src/lib/components/common/MultiSelect.svelte");
		expect(source).toContain("<Badge");
		expect(source).not.toContain("rounded-full px-1");
		expect(source).not.toContain("text-[0.625rem]");
	});

	test("single select forwards the trigger variant", () => {
		const source = read("src/lib/components/common/SingleSelect.svelte");
		expect(source).toContain("<Select.Trigger");
		expect(source).toContain("variant={variant}");
	});

	test("single select keeps selected non-ghost values foreground", () => {
		const source = read("src/lib/components/common/SingleSelect.svelte");
		expect(source).toMatch(
			/variant !== 'ghost' && value !== null && 'text-foreground'/
		);
	});

	test("intake tag is a plain token badge", () => {
		const source = read("src/lib/components/common/IntakeTag.svelte");
		expect(source).toContain("<Badge");
		expect(source).not.toContain("bg-primary");
		expect(source).not.toContain("text-primary");
	});

	test("brand wordmark keeps its heading weight", () => {
		const source = read("src/lib/components/app-sidebar.svelte");
		expect(source).toContain("truncate font-semibold tracking-tight");
		expect(source).toContain("hidden font-semibold tracking-tight");
	});

	test("feed search and hotkey hints use their primitives", () => {
		expect(read("src/lib/components/filter/FeedSearch.svelte")).toContain("primitives/input");
		expect(read("src/lib/components/hotkeys/Hint.svelte")).toContain("primitives/kbd");
	});

	test("shell keeps the mobile trigger, code copy and filter scope", () => {
		expect(read("src/routes/(app)/+layout.svelte")).toContain("<Sidebar.Trigger");
		expect(read("src/lib/components/markdown/CodeBlock.svelte")).toContain("CodeBlock.CopyButton");
		const filter = read("src/lib/components/filter/FilterPopover.svelte");
		expect(filter).toContain("const ME = 'me'");
		expect(filter).toContain("value === ME");
	});
});
