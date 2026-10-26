/**
 * T10: settings, auth, onboarding, intake and inbox.
 *
 * These are source contracts, not render tests: each surface has already been
 * rewritten to import from `#lib/components/primitives`, so the remaining job
 * is to prove the call sites hand presentation to the primitive layer and keep
 * only layout/accessibility classes, and that the form protocols (labels,
 * errors, disabled states, save/test/duplicate actions) survived the migration.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function read(path: string): string {
	return readFileSync(join(root, path), "utf8");
}

/** Every `.svelte`/`.ts` file under a T10-owned path. */
const OWNED_PATHS = [
	"src/lib/components/settings",
	"src/lib/components/onboarding",
	"src/lib/components/inbox",
	"src/routes/(app)/settings",
	"src/routes/intake",
	"src/routes/login",
	"src/routes/onboarding",
	"src/routes/(app)/inbox"
];

function walk(path: string): string[] {
	const absolute = join(root, path);
	if (!statSync(absolute).isDirectory()) return [path];

	const out: string[] = [];
	for (const entry of readdirSync(absolute)) {
		out.push(...walk(join(path, entry)));
	}
	return out;
}

const ownedFiles = OWNED_PATHS.flatMap(walk).filter((file) => /\.(svelte|ts)$/.test(file));
const ownedSources = new Map(ownedFiles.map((file) => [file, read(file)]));

/** Every self-closing `<Tag ... />` block, so prop assertions hit the right call site. */
function tagBlocks(source: string, tag: string): string[] {
	return source.match(new RegExp(`<${tag}\\b[\\s\\S]*?/>`, "g")) ?? [];
}

describe("forms primitives", () => {
	test("settings use primitives", () => {
		const source = read("src/routes/(app)/settings/projects/+page.svelte");
		expect(source).toContain("primitives/");
		expect(source).not.toContain("components/ui/");
	});

	test("intake ghost title", () => {
		const source = read("src/routes/intake/+page.svelte");
		// The writing canvas is one borderless editor, not a re-styled input.
		const title = tagBlocks(source, "Input").find((block) =>
			block.includes('name="title"')
		);
		expect(title).toBeDefined();
		expect(title).toContain('variant="ghost"');
		expect(title).toContain("text-lg");
		expect(title).toContain("font-medium");
		expect(tagBlocks(source, "Textarea")[0]).toContain('variant="ghost"');
		expect(source).not.toContain("components/ui/");
	});

	test("owned surfaces never reach for the old namespace", () => {
		expect(ownedFiles.length).toBeGreaterThan(20);
		for (const [file, source] of ownedSources) {
			expect(`${file}: ${source.includes("components/ui/")}`).toBe(`${file}: false`);
		}
	});

	test("owned surfaces carry no dark variants or hard-coded colours", () => {
		for (const [file, source] of ownedSources) {
			expect(`${file}: ${source.includes("dark:")}`).toBe(`${file}: false`);
			expect(`${file}: ${/#[0-9a-fA-F]{6}\b/.test(source)}`).toBe(`${file}: false`);
		}
	});

	test("avatars stay round", () => {
		const avatars = [
			"src/routes/(app)/settings/+page.svelte",
			"src/routes/(app)/settings/people/+page.svelte",
			"src/routes/(app)/settings/planning/+page.svelte"
		];
		for (const file of avatars) {
			const source = read(file);
			expect(source).toContain("Avatar.Root");
			expect(source).not.toContain("rounded-xl");
			expect(source).not.toContain("rounded-lg");
		}
	});

	test("primitive call sites keep layout, not panel padding hacks", () => {
		for (const [file, source] of ownedSources) {
			expect(`${file}: ${source.includes("pt-6")}`).toBe(`${file}: false`);
		}
	});

	test("settings forms keep the save action and its disabled state", () => {
		const source = read("src/lib/components/settings/settings-form.svelte");
		expect(source).toContain('action="?/save"');
		expect(source).toContain('name="payload"');
		expect(source).toContain("disabled={saving}");
		expect(source).toContain('variant="destructive"');
	});

	test("inbox duplicate and triage actions are unchanged", () => {
		const dialog = read("src/lib/components/inbox/DuplicateDialog.svelte");
		expect(dialog).toContain('action="?/duplicate"');
		expect(dialog).toContain('name="number"');
		expect(dialog).toContain("disabled={pending");

		const detail = read("src/lib/components/inbox/SubmissionDetail.svelte");
		expect(detail).toContain('action="?/accept"');
		expect(detail).toContain('action="?/dismiss"');
		expect(detail).toContain("restoreSubmission");
	});

	test("native selects stay native and bound", () => {
		const intake = read("src/routes/(app)/settings/intake/+page.svelte");
		expect(intake).toContain("NativeSelect.Root");
		expect(intake).toContain("bind:value={defaultRepo}");

		const people = read("src/routes/(app)/settings/people/+page.svelte");
		expect(people).toContain('NativeSelect.Root name="role"');

		const onboarding = read("src/routes/onboarding/+page.svelte");
		expect(onboarding).toContain("NativeSelect.Root");
		expect(onboarding).toContain("bind:value={account}");
	});

	test("onboarding steps bind the active step", () => {
		const steps = read("src/lib/components/onboarding/onboarding-steps.svelte");
		expect(steps).toContain("active");
		expect(steps).toMatch(/aria-current=\{current \? ['"]step['"] : undefined\}/);
		expect(steps).not.toContain("emerald");
	});

	test("intake keeps its error and disabled wiring", () => {
		const source = read("src/routes/intake/+page.svelte");
		expect(source).toContain("aria-invalid={form?.error ? true : undefined}");
		expect(source).toContain("aria-errormessage={form?.error ? 'submit-error' : undefined}");
		expect(source).toContain("disabled={submitting}");
		expect(source).toContain("required");
	});
});
