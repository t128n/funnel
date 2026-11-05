/**
 * Focused coverage gate: `bun scripts/check-coverage.ts`.
 *
 * The suite collects coverage over all of `src` and `tests`, but this gate only
 * aggregates the core server directories. UI, routes, generated code,
 * `src/standalone.ts`, and tests are intentionally outside the floor.
 *
 * Reads `coverage/lcov.info` (written by the lcov reporter in `bunfig.toml`)
 * and exits non-zero when aggregate line or function coverage falls below the
 * floor. Run it directly or through `bun run test` / `mise run test`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const CORE_DIRECTORIES = [
  "src/lib/server/issues",
  "src/lib/server/intake",
  "src/lib/server/sync",
  "src/lib/server/github",
] as const;

export const DEFAULT_MIN_LINES = 0.95;
export const DEFAULT_MIN_FUNCTIONS = 0.95;

export interface FileCoverage {
  file: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

export interface DirectoryCoverage {
  directory: string;
  files: number;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
  linePercent: number;
  functionPercent: number;
}

export interface CoverageSummary {
  directories: DirectoryCoverage[];
  total: DirectoryCoverage;
}

export interface CoverageThresholds {
  minLines?: number;
  minFunctions?: number;
}

export interface CoverageEvaluation {
  ok: boolean;
  failures: string[];
  minLines: number;
  minFunctions: number;
}

const LCOV_PATH = joinRoot("coverage", "lcov.info");

function joinRoot(...parts: string[]): string {
  return resolve(import.meta.dir, "..", ...parts);
}

function toCount(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalisePath(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isTestFile(file: string): boolean {
  const path = normalisePath(file);
  return (
    path.startsWith("tests/") ||
    path.includes("/tests/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
  );
}

function coreDirectoryFor(
  file: string,
  coreDirectories: readonly string[],
): string | null {
  const path = normalisePath(file);
  for (const directory of coreDirectories) {
    if (path === directory || path.startsWith(`${directory}/`)) {
      return directory;
    }
    if (path.includes(`/${directory}/`)) {
      return directory;
    }
  }
  return null;
}

function percent(hit: number, found: number): number {
  return found === 0 ? 1 : hit / found;
}

/**
 * Parse an lcov report into one record per source file.
 *
 * Unknown and malformed lines are ignored. Missing records default to zero so
 * a partial report still aggregates instead of throwing.
 */
export function parseLcov(text: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  let current: FileCoverage | null = null;

  const finish = () => {
    if (current !== null) files.push(current);
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (line === "end_of_record") {
      finish();
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);

    switch (key) {
      case "SF":
        finish();
        current = {
          file: value,
          linesFound: 0,
          linesHit: 0,
          functionsFound: 0,
          functionsHit: 0,
        };
        break;
      case "LF":
        if (current !== null) current.linesFound = toCount(value);
        break;
      case "LH":
        if (current !== null) current.linesHit = toCount(value);
        break;
      case "FNF":
        if (current !== null) current.functionsFound = toCount(value);
        break;
      case "FNH":
        if (current !== null) current.functionsHit = toCount(value);
        break;
    }
  }

  finish();
  return files;
}

function emptyDirectory(directory: string): DirectoryCoverage {
  return {
    directory,
    files: 0,
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    linePercent: 1,
    functionPercent: 1,
  };
}

function finalise(entry: DirectoryCoverage): DirectoryCoverage {
  return {
    ...entry,
    linePercent: percent(entry.linesHit, entry.linesFound),
    functionPercent: percent(entry.functionsHit, entry.functionsFound),
  };
}

/**
 * Aggregate records for the four core directories only. Test files, routes,
 * components, generated code, and every other path are ignored.
 */
export function summariseCoreCoverage(
  files: readonly FileCoverage[],
  coreDirectories: readonly string[] = CORE_DIRECTORIES,
): CoverageSummary {
  const byDirectory = new Map<string, DirectoryCoverage>();
  for (const directory of coreDirectories) {
    byDirectory.set(directory, emptyDirectory(directory));
  }

  for (const file of files) {
    if (isTestFile(file.file)) continue;

    const directory = coreDirectoryFor(file.file, coreDirectories);
    if (directory === null) continue;

    const entry = byDirectory.get(directory) ?? emptyDirectory(directory);
    entry.files += 1;
    entry.linesFound += file.linesFound;
    entry.linesHit += file.linesHit;
    entry.functionsFound += file.functionsFound;
    entry.functionsHit += file.functionsHit;
    byDirectory.set(directory, entry);
  }

  const directories = coreDirectories.map((directory) =>
    finalise(byDirectory.get(directory) ?? emptyDirectory(directory)),
  );

  const total = finalise(
    directories.reduce<DirectoryCoverage>((sum, entry) => {
      sum.files += entry.files;
      sum.linesFound += entry.linesFound;
      sum.linesHit += entry.linesHit;
      sum.functionsFound += entry.functionsFound;
      sum.functionsHit += entry.functionsHit;
      return sum;
    }, emptyDirectory("Total")),
  );

  return { directories, total };
}

/**
 * Compare an aggregate summary against the floors. Percentages are compared
 * against the raw ratio, so exactly 95% passes and anything below it fails.
 */
export function evaluateCoverage(
  summary: CoverageSummary,
  thresholds: CoverageThresholds = {},
): CoverageEvaluation {
  const minLines = thresholds.minLines ?? DEFAULT_MIN_LINES;
  const minFunctions = thresholds.minFunctions ?? DEFAULT_MIN_FUNCTIONS;
  const failures: string[] = [];

  if (summary.total.files === 0) {
    failures.push(
      `no core files found under ${CORE_DIRECTORIES.join(", ")}`,
    );
  } else if (summary.total.linesFound === 0) {
    failures.push("no line records found for the core files");
  } else if (summary.total.linePercent < minLines) {
    failures.push(
      `core lines ${formatPercent(summary.total.linePercent)} ` +
        `(${summary.total.linesHit}/${summary.total.linesFound}) is below the ` +
        `${formatPercent(minLines)} floor`,
    );
  }

  if (summary.total.files > 0 && summary.total.functionsFound === 0) {
    failures.push("no function records found for the core files");
  } else if (
    summary.total.files > 0 &&
    summary.total.functionPercent < minFunctions
  ) {
    failures.push(
      `core functions ${formatPercent(summary.total.functionPercent)} ` +
        `(${summary.total.functionsHit}/${summary.total.functionsFound}) is below the ` +
        `${formatPercent(minFunctions)} floor`,
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    minLines,
    minFunctions,
  };
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatRatio(hit: number, found: number): string {
  return `${formatPercent(percent(hit, found))} (${hit}/${found})`;
}

export function formatSummary(summary: CoverageSummary): string {
  const nameWidth = Math.max(
    "Directory".length,
    "Total".length,
    ...summary.directories.map((entry) => entry.directory.length),
  );

  const lines = [
    `${"Directory".padEnd(nameWidth)}  ${"Files".padStart(5)}  ${"Lines".padStart(22)}  ${"Functions".padStart(22)}`,
    `${"-".repeat(nameWidth)}  ${"-".repeat(5)}  ${"-".repeat(22)}  ${"-".repeat(22)}`,
  ];

  for (const entry of summary.directories) {
    lines.push(
      `${entry.directory.padEnd(nameWidth)}  ${String(entry.files).padStart(5)}  ` +
        `${formatRatio(entry.linesHit, entry.linesFound).padStart(22)}  ` +
        formatRatio(entry.functionsHit, entry.functionsFound).padStart(22),
    );
  }

  lines.push(
    `${"Total".padEnd(nameWidth)}  ${String(summary.total.files).padStart(5)}  ` +
      `${formatRatio(summary.total.linesHit, summary.total.linesFound).padStart(22)}  ` +
      formatRatio(summary.total.functionsHit, summary.total.functionsFound).padStart(22),
  );

  return lines.join("\n");
}

interface CliOptions {
  lcovPath: string;
  minLines: number;
  minFunctions: number;
}

function readOption(args: readonly string[], name: string): string | undefined {
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed !== undefined) return prefixed.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];
  return undefined;
}

function parseNumberOption(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number, got "${value}"`);
  }
  return parsed;
}

export function parseArgs(args: readonly string[]): CliOptions {
  return {
    lcovPath: resolve(readOption(args, "--lcov") ?? LCOV_PATH),
    minLines: parseNumberOption(
      readOption(args, "--min-lines"),
      "--min-lines",
      DEFAULT_MIN_LINES,
    ),
    minFunctions: parseNumberOption(
      readOption(args, "--min-functions"),
      "--min-functions",
      DEFAULT_MIN_FUNCTIONS,
    ),
  };
}

function main(): void {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[coverage] ${(error as Error).message}`);
    process.exit(1);
  }

  let lcov: string;
  try {
    lcov = readFileSync(options.lcovPath, "utf8");
  } catch {
    console.error(
      `[coverage] ${options.lcovPath} is missing. ` +
        "Run `mise run test` (or `bun run test`) to generate it.",
    );
    process.exit(1);
  }

  const summary = summariseCoreCoverage(parseLcov(lcov));
  const evaluation = evaluateCoverage(summary, {
    minLines: options.minLines,
    minFunctions: options.minFunctions,
  });

  console.log("Coverage gate: core server logic");
  console.log(
    `Scope: ${CORE_DIRECTORIES.join(", ")} (tests and non-core paths excluded)`,
  );
  console.log(
    `Floors: lines ${formatPercent(evaluation.minLines)}, functions ${formatPercent(evaluation.minFunctions)}`,
  );
  console.log("");
  console.log(formatSummary(summary));
  console.log("");

  if (!evaluation.ok) {
    for (const failure of evaluation.failures) {
      console.error(`[coverage] FAIL: ${failure}`);
    }
    console.error(
      "[coverage] Raise coverage, or deliberately adjust the floor in scripts/check-coverage.ts.",
    );
    process.exit(1);
  }

  console.log(
    `[coverage] PASS: core lines ${formatPercent(summary.total.linePercent)}, ` +
      `core functions ${formatPercent(summary.total.functionPercent)} ` +
      `(floor ${formatPercent(evaluation.minLines)}/${formatPercent(evaluation.minFunctions)}).`,
  );
}

if (import.meta.main) {
  main();
}
