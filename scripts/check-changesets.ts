/**
 * Pre-release bump guard: `bun run changeset:check`.
 *
 * Funnel reserves 0.1.0 for the first normal release and keeps the 0.0.x line
 * patch-only. While `package.json` is on 0.0.x, every pending changeset must be
 * a `patch`; a `minor` or `major` bump is a mistake that would skip 0.1.0.
 *
 * The deliberate 0.1.0 release is the exception: pass `--allow-minor` (or bump
 * `package.json` before running the check) when preparing it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

type Bump = "patch" | "minor" | "major";

const root = resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version?: unknown;
};
const version = String(pkg.version ?? "");
const allowMinor = process.argv.includes("--allow-minor");

// The guard only applies to the 0.0.x pre-release line. Once the version is
// 0.1.0 or later, normal semver applies.
if (!/^0\.0\.\d+$/.test(version)) {
  console.log(`[changesets] version ${version} is not on the 0.0.x line; bump check skipped.`);
  process.exit(0);
}

const dir = join(root, ".changeset");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

const violations: Array<{ file: string; bump: Bump }> = [];

for (const file of files) {
  const text = readFileSync(join(dir, file), "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!frontmatter) continue;

  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = /^\s*"?[^":]+"?\s*:\s*(patch|minor|major)\s*$/.exec(line);
    if (match === null) continue;
    const bump = match[1] as Bump;
    if (bump !== "patch") violations.push({ file, bump });
  }
}

if (files.length === 0) {
  console.log("[changesets] no pending changesets.");
  process.exit(0);
}

if (violations.length === 0) {
  console.log(`[changesets] ${files.length} pending changeset(s), all patch.`);
  process.exit(0);
}

const detail = violations
  .map(({ file, bump }) => `  ${file}: ${bump}`)
  .join("\n");

if (allowMinor) {
  console.warn(
    `[changesets] allowing non-patch bumps for the 0.1.0 release:\n${detail}`,
  );
  process.exit(0);
}

console.error(
  [
    `[changesets] ${version} is a 0.0.x pre-release, so every changeset must be a patch.`,
    "Use `\"funnel\": patch`; keep minor for the deliberate 0.1.0 release.",
    "Offending changesets:",
    detail,
    "Run `bun run changeset:check --allow-minor` only when preparing 0.1.0.",
  ].join("\n"),
);
process.exit(1);
