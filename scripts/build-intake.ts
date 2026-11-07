/**
 * Release build for the Funnel intake app.
 *
 * Usage:
 *   bun scripts/build-intake.ts [--platform=windows-x64|darwin-arm64|darwin-x64|linux-x64]
 *                               [--outdir=dist] [--outfile=funnel-intake[.exe]]
 *
 * The daemon and settings window are one Rust executable. Building happens on
 * the target OS so the native hotkey, clipboard and GUI libraries are linked
 * against the real platform SDK.
 */
import { copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function defaultPlatform(): string {
  if (process.platform === "win32") return "windows-x64";
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  return process.arch === "arm64" ? "linux-arm64" : "linux-x64";
}

const platform = argValue("--platform") ?? defaultPlatform();
const targets: Record<string, string> = {
  "windows-x64": "x86_64-pc-windows-msvc",
  "windows-arm64": "aarch64-pc-windows-msvc",
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
};
const target = targets[platform];
if (!target) {
  console.error(`[intake] unsupported platform ${platform}`);
  process.exit(1);
}

const outDir = resolve(projectRoot, argValue("--outdir") ?? "dist");
const binaryName = platform.startsWith("windows-")
  ? "funnel-intake.exe"
  : "funnel-intake";
const outfile = join(outDir, argValue("--outfile") ?? binaryName);
mkdirSync(outDir, { recursive: true });

const pkg = (await Bun.file(join(projectRoot, "package.json")).json()) as {
  version?: string;
};
const version = pkg.version ?? "dev";
const manifest = join(projectRoot, "tools", "funnel-intake", "rust", "Cargo.toml");

console.log(`[intake] ${platform} (${target}) -> ${outfile}`);

const result = Bun.spawnSync({
  cmd: [
    "cargo",
    "build",
    "--locked",
    "--release",
    "--manifest-path",
    manifest,
    "--target",
    target,
  ],
  cwd: join(projectRoot, "tools", "funnel-intake", "rust"),
  env: {
    ...process.env,
    FUNNEL_INTAKE_VERSION: version,
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

if ((result.exitCode ?? 1) !== 0) {
  console.error(`[intake] cargo build failed with exit code ${result.exitCode}`);
  process.exit(result.exitCode ?? 1);
}

const built = join(
  projectRoot,
  "tools",
  "funnel-intake",
  "rust",
  "target",
  target,
  "release",
  binaryName,
);
copyFileSync(built, outfile);
if (!platform.startsWith("windows-")) chmodSync(outfile, 0o755);
console.log(`[intake] wrote ${outfile}`);
