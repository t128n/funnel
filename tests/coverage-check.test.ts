import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_MIN_FUNCTIONS,
  DEFAULT_MIN_LINES,
  evaluateCoverage,
  formatPercent,
  parseArgs,
  parseLcov,
  summariseCoreCoverage,
  type FileCoverage,
} from "../scripts/check-coverage";

const ROOT = resolve(import.meta.dir, "..");
const cleanup: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

function record(
  file: string,
  options: {
    lf?: number;
    lh?: number;
    fnf?: number;
    fnh?: number;
  } = {},
): string {
  const { lf = 0, lh = 0, fnf = 0, fnh = 0 } = options;
  return [
    `SF:${file}`,
    `FNF:${fnf}`,
    `FNH:${fnh}`,
    `LF:${lf}`,
    `LH:${lh}`,
    "end_of_record",
  ].join("\n");
}

function file(
  path: string,
  linesFound: number,
  linesHit: number,
  functionsFound = 0,
  functionsHit = 0,
): FileCoverage {
  return {
    file: path,
    linesFound,
    linesHit,
    functionsFound,
    functionsHit,
  };
}

function runChecker(args: string[]) {
  return spawnSync(
    process.execPath,
    ["scripts/check-coverage.ts", ...args],
    { cwd: ROOT, encoding: "utf8" },
  );
}

afterEach(() => {
  for (const path of cleanup.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("parseLcov", () => {
  test("parses multiple files and all coverage records", () => {
    const parsed = parseLcov(
      [
        "TN:",
        record("src/lib/server/issues/filters.ts", {
          lf: 20,
          lh: 18,
          fnf: 4,
          fnh: 3,
        }),
        record("src/lib/server/sync/mirror.ts", {
          lf: 10,
          lh: 10,
          fnf: 2,
          fnh: 2,
        }),
      ].join("\n"),
    );

    expect(parsed).toEqual([
      file("src/lib/server/issues/filters.ts", 20, 18, 4, 3),
      file("src/lib/server/sync/mirror.ts", 10, 10, 2, 2),
    ]);
  });

  test("defaults missing records to zero", () => {
    const parsed = parseLcov(
      ["SF:src/lib/server/intake/prefill.ts", "LF:12", "end_of_record"].join(
        "\n",
      ),
    );

    expect(parsed).toEqual([file("src/lib/server/intake/prefill.ts", 12, 0)]);
  });

  test("accepts a final record without end_of_record and CRLF line endings", () => {
    const parsed = parseLcov(
      "SF:src/lib/server/github/cache.ts\r\nLF:8\r\nLH:7\r\nFNF:2\r\nFNH:1\r\n",
    );

    expect(parsed).toEqual([
      file("src/lib/server/github/cache.ts", 8, 7, 2, 1),
    ]);
  });

  test("ignores empty, malformed, and non-numeric input", () => {
    expect(parseLcov("")).toEqual([]);
    expect(parseLcov("not lcov\nrandom:value\n")).toEqual([]);

    const parsed = parseLcov(
      [
        "SF:src/lib/server/issues/http.ts",
        "LF:not-a-number",
        "LH:-4",
        "FNF:",
        "FNH:oops",
        "DA:1,1",
        "end_of_record",
      ].join("\n"),
    );

    expect(parsed).toEqual([file("src/lib/server/issues/http.ts", 0, 0)]);
  });
});

describe("summariseCoreCoverage", () => {
  test("aggregates only the four core directories", () => {
    const summary = summariseCoreCoverage([
      file("src/lib/server/issues/filters.ts", 100, 99, 10, 9),
      file("src/lib/server/intake/staging.ts", 50, 40, 5, 4),
      file("src/lib/server/sync/mirror.ts", 200, 200, 20, 20),
      file("src/lib/server/github/labels.ts", 25, 25, 4, 4),
      file("src/routes/api/events/+server.ts", 100, 0, 10, 0),
      file("src/lib/components/Button.svelte", 100, 0, 10, 0),
      file("src/standalone.ts", 100, 0, 10, 0),
      file("tests/intake.test.ts", 100, 0, 10, 0),
      file("src/lib/server/issues/filters.test.ts", 100, 0, 10, 0),
      file("src/lib/server/other.ts", 100, 0, 10, 0),
    ]);

    expect(summary.total.files).toBe(4);
    expect(summary.total.linesFound).toBe(375);
    expect(summary.total.linesHit).toBe(364);
    expect(summary.total.functionsFound).toBe(39);
    expect(summary.total.functionsHit).toBe(37);
  });

  test("normalises ./ prefixes and Windows separators before matching", () => {
    const summary = summariseCoreCoverage([
      file("./src/lib/server/issues/filters.ts", 10, 10),
      file("src\\lib\\server\\sync\\mirror.ts", 10, 5),
    ]);

    expect(summary.total.files).toBe(2);
    expect(summary.total.linesHit).toBe(15);
  });

  test("reports per-directory percentages and counts", () => {
    const summary = summariseCoreCoverage([
      file("src/lib/server/issues/filters.ts", 10, 9, 2, 2),
      file("src/lib/server/sync/mirror.ts", 10, 10, 2, 1),
    ]);

    const issues = summary.directories.find(
      (entry) => entry.directory === "src/lib/server/issues",
    );
    const sync = summary.directories.find(
      (entry) => entry.directory === "src/lib/server/sync",
    );

    expect(issues?.linePercent).toBeCloseTo(0.9);
    expect(issues?.functionPercent).toBe(1);
    expect(sync?.linePercent).toBe(1);
    expect(sync?.functionPercent).toBeCloseTo(0.5);
    expect(summary.total.linePercent).toBeCloseTo(0.95);
  });
});

describe("evaluateCoverage", () => {
  test("passes at exactly the floor", () => {
    const summary = summariseCoreCoverage([
      file("src/lib/server/issues/filters.ts", 200, 190, 100, 95),
    ]);

    const result = evaluateCoverage(summary, {
      minLines: 0.95,
      minFunctions: 0.95,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("fails just below the line floor", () => {
    const summary = summariseCoreCoverage([
      file("src/lib/server/issues/filters.ts", 200, 189, 100, 95),
    ]);

    const result = evaluateCoverage(summary, {
      minLines: 0.95,
      minFunctions: 0.95,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("core lines 94.50%");
    expect(result.failures[0]).toContain("95.00% floor");
  });

  test("fails just below the function floor", () => {
    const summary = summariseCoreCoverage([
      file("src/lib/server/sync/mirror.ts", 200, 200, 100, 94),
    ]);

    const result = evaluateCoverage(summary, {
      minLines: 0.95,
      minFunctions: 0.95,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("core functions 94.00%");
  });

  test("uses 95% defaults", () => {
    expect(DEFAULT_MIN_LINES).toBe(0.95);
    expect(DEFAULT_MIN_FUNCTIONS).toBe(0.95);

    const summary = summariseCoreCoverage([
      file("src/lib/server/issues/filters.ts", 100, 94, 100, 100),
    ]);

    expect(evaluateCoverage(summary).ok).toBe(false);
  });

  test("fails when no core files were found", () => {
    const summary = summariseCoreCoverage([
      file("src/routes/api/events/+server.ts", 100, 100, 10, 10),
      file("src/standalone.ts", 100, 0, 10, 0),
    ]);

    const result = evaluateCoverage(summary);

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain("no core files found");
  });

  test("formats percentages with two decimals", () => {
    expect(formatPercent(0.9595)).toBe("95.95%");
    expect(formatPercent(1)).toBe("100.00%");
  });
});

describe("check-coverage CLI", () => {
  test("exits 1 when the lcov file is missing", () => {
    const result = runChecker([
      "--lcov",
      join(tempDir("funnel-coverage-missing-"), "lcov.info"),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is missing");
    expect(result.stderr).toContain("mise run test");
  });

  test("exits 1 when no core files are present", () => {
    const path = join(tempDir("funnel-coverage-empty-"), "lcov.info");
    writeFileSync(
      path,
      record("src/routes/api/events/+server.ts", {
        lf: 10,
        lh: 10,
        fnf: 1,
        fnh: 1,
      }),
    );

    const result = runChecker(["--lcov", path]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no core files found");
  });

  test("prints the summary and exits 0 when the gate passes", () => {
    const path = join(tempDir("funnel-coverage-pass-"), "lcov.info");
    writeFileSync(
      path,
      record("src/lib/server/issues/filters.ts", {
        lf: 200,
        lh: 190,
        fnf: 100,
        fnh: 95,
      }),
    );

    const result = runChecker(["--lcov", path, "--min-lines", "0.95"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Coverage gate: core server logic");
    expect(result.stdout).toContain("95.00% (190/200)");
    expect(result.stdout).toContain("[coverage] PASS");
  });

  test("exits 1 and explains the failure when below the floor", () => {
    const path = join(tempDir("funnel-coverage-fail-"), "lcov.info");
    writeFileSync(
      path,
      record("src/lib/server/issues/filters.ts", {
        lf: 200,
        lh: 190,
        fnf: 100,
        fnh: 95,
      }),
    );

    const result = runChecker(["--lcov", path, "--min-lines", "1"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[coverage] FAIL");
    expect(result.stderr).toContain("is below the 100.00% floor");
  });
});

describe("parseArgs", () => {
  test("reads --flag value and --flag=value forms", () => {
    expect(
      parseArgs([
        "--lcov",
        "/tmp/report.info",
        "--min-lines",
        "0.9",
        "--min-functions=0.8",
      ]),
    ).toEqual({
      lcovPath: "/tmp/report.info",
      minLines: 0.9,
      minFunctions: 0.8,
    });
  });

  test("defaults to coverage/lcov.info and 95% floors", () => {
    const options = parseArgs([]);

    expect(options.lcovPath.endsWith(join("coverage", "lcov.info"))).toBe(true);
    expect(options.minLines).toBe(0.95);
    expect(options.minFunctions).toBe(0.95);
  });

  test("rejects non-numeric floors", () => {
    expect(() => parseArgs(["--min-lines", "nope"])).toThrow(
      "--min-lines must be a non-negative number",
    );
  });
});
