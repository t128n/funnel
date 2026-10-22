/**
 * Native build for the Funnel intake hotkey helper.
 *
 * Usage:
 *   bun scripts/build-intake.ts [--target=windows/amd64] [--outdir=dist]
 *                               [--outfile=funnel-intake.exe]
 *
 * The helper is pure Go (no cgo), so it cross-compiles from any OS. The
 * release artifact is a GUI-subsystem executable: no console window flashes
 * when the hotkey fires.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Resolve the repo root from this script so the build works from any directory.
const projectRoot = resolve(import.meta.dir, "..");

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const target = argValue("--target") ?? "windows/amd64";
const [goos, goarch] = target.split("/");
if (goos !== "windows" || !goarch) {
  console.error(`[intake] unsupported target ${target}; expected windows/<arch>`);
  process.exit(1);
}

const outDir = resolve(projectRoot, argValue("--outdir") ?? "dist");
const outName = argValue("--outfile") ?? "funnel-intake.exe";
const outfile = join(outDir, outName);
mkdirSync(outDir, { recursive: true });

const pkg = (await Bun.file(join(projectRoot, "package.json")).json()) as {
  version?: string;
};
const version = pkg.version ?? "dev";

const moduleDir = join(projectRoot, "tools", "funnel-intake");
const ldflags = `-s -w -H=windowsgui -X main.version=${version}`;

console.log(`[intake] ${target} -> ${outfile}`);

const result = Bun.spawnSync({
  cmd: [
    "go",
    "build",
    "-trimpath",
    "-ldflags",
    ldflags,
    "-o",
    outfile,
    "./cmd/funnel-intake",
  ],
  cwd: moduleDir,
  env: {
    ...process.env,
    CGO_ENABLED: "0",
    GOOS: goos,
    GOARCH: goarch,
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

if ((result.exitCode ?? 1) !== 0) {
  console.error(`[intake] go build failed with exit code ${result.exitCode}`);
  process.exit(result.exitCode ?? 1);
}
