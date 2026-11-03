/**
 * Assemble one platform's GitHub release archive.
 *
 * Usage:
 *   bun scripts/package-release.ts --version=0.0.1 --platform=linux-x64
 *                                   [--bin=dist/funnel] [--outdir=release]
 *
 * The archive contains the self-contained `funnel` executable. The Windows
 * archive also contains the optional intake hotkey helper and the PowerShell
 * installers, so a release download is enough to install either delivery path.
 *
 * Each run writes `<archive>` and `<archive>.sha256`; the release workflow
 * merges the per-platform checksum files into a single `SHA256SUMS.txt`.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

function fail(message: string): never {
  console.error(`[package] ${message}`);
  process.exit(1);
}

/** Copy a repo-relative file into the staging directory. */
function stageFile(from: string, to: string): void {
  const source = join(projectRoot, from);
  if (!existsSync(source)) fail(`missing file: ${from}`);
  copyFileSync(source, join(stageDir, to));
}

const version = argValue("--version");
if (!version) fail("--version is required (for example --version=0.0.1)");

const platform = argValue("--platform");
if (!platform) fail("--platform is required (for example --platform=linux-x64)");
if (!/^[a-z0-9]+-[a-z0-9]+$/.test(platform)) {
  fail(`invalid platform "${platform}"; expected <os>-<arch>, for example linux-x64`);
}

const isWindows = platform.startsWith("windows-");
const binaryName = isWindows ? "funnel.exe" : "funnel";
const archiveExtension = isWindows ? "zip" : "tar.gz";

const binaryPath = resolve(
  projectRoot,
  argValue("--bin") ?? join("dist", binaryName),
);
if (!existsSync(binaryPath)) {
  fail(
    `${binaryName} is missing at ${binaryPath}; run \`bun run build\` and ` +
      "`bun scripts/build-standalone.ts` first.",
  );
}

const outDir = resolve(projectRoot, argValue("--outdir") ?? "release");
const archiveName = `funnel-${version}-${platform}`;
const archivePath = join(outDir, `${archiveName}.${archiveExtension}`);
const stageRoot = join(outDir, `.stage-${platform}`);
const stageDir = join(stageRoot, archiveName);

rmSync(stageRoot, { recursive: true, force: true });
rmSync(archivePath, { force: true });
mkdirSync(stageDir, { recursive: true });

copyFileSync(binaryPath, join(stageDir, binaryName));
if (!isWindows) chmodSync(join(stageDir, binaryName), 0o755);

// Ship the configuration template with every archive. The executable embeds the
// server and assets, but operators still need the documented environment names.
stageFile(".env.example", ".env.example");

if (isWindows) {
  const intakePath = join(projectRoot, "dist", "funnel-intake.exe");
  if (!existsSync(intakePath)) {
    fail(
      "dist/funnel-intake.exe is missing; run `bun scripts/build-intake.ts` " +
        "before packaging the Windows archive.",
    );
  }
  copyFileSync(intakePath, join(stageDir, "funnel-intake.exe"));

  // `funnel.exe setup` owns service configuration. WinSW is shipped as a
  // sibling so the installer can materialize it without a runtime download.
  stageFile("packaging/windows/setup.cmd", "setup.cmd");
  stageFile("scripts/install-intake.ps1", "install-intake.ps1");

  const winsw = join(projectRoot, "vendor", "winsw", "WinSW.NET461.exe");
  if (existsSync(winsw)) {
    copyFileSync(winsw, join(stageDir, "funnel-service.exe"));
  } else {
    fail(
      "vendor/winsw/WinSW.NET461.exe is missing; run `bun scripts/fetch-winsw.ts` before packaging the Windows archive.",
    );
  }
}

const notices = join(projectRoot, "THIRD_PARTY_NOTICES.md");
if (existsSync(notices)) {
  copyFileSync(notices, join(stageDir, "THIRD_PARTY_NOTICES.md"));
}

const readme = isWindows
  ? `Funnel ${version} - pre-release
===============================

Self-contained server. The Bun runtime, SvelteKit server, client assets, native
Markdown addon and database migrations are embedded in funnel.exe; no Bun,
Node.js, or container runtime is required.

Guided setup (recommended):

  Double-click setup.cmd, or run:
  .\\funnel.exe setup

The wizard creates the config from .env.example, lets you choose the Windows
service or a portable process, validates paths and ports, and opens the
onboarding URL. Service installation asks for administrator rights automatically.

Manual quick start (PowerShell):

  .\\funnel.exe --version
  .\\funnel.exe --help
  .\\funnel.exe

The executable keeps state under .\\data by default (funnel.db and uploads/).
Set FUNNEL_DATA_DIR to use another directory. Funnel requires FUNNEL_SECRET in
the environment or in a .env file in the working directory. Copy .env.example
to .env and fill in the values, or let \`funnel setup\` create one.

Lifecycle:

  .\\funnel.exe setup
  .\\funnel.exe status
  .\\funnel.exe logs
  .\\funnel.exe uninstall

The setup command installs the WinSW service, creates the config from
.env.example with a generated FUNNEL_SECRET, and preserves an existing secret.
Uninstall keeps data and configuration unless you add --purge.

Optional intake hotkey helper (per user, no elevation):

  powershell -ExecutionPolicy Bypass -File .\\install-intake.ps1 -Url http://localhost:3000

Then select text in Teams, Outlook, or a browser and press Ctrl+Alt+I.

Health probes: /healthz (liveness) and /readyz (readiness).
Apply migrations without starting the server: .\\funnel.exe --migrate

Funnel is a single-instance application. Do not scale it horizontally or run
two instances against the same data directory.

Documentation: https://github.com/t128n/funnel/tree/main/docs
`
  : `Funnel ${version} - pre-release
===============================

Self-contained server. The Bun runtime, SvelteKit server, client assets, native
Markdown addon and database migrations are embedded in this executable; no
Bun, Node.js, or container runtime is required.

Quick start:

  ./funnel --version
  ./funnel --help
  ./funnel

The executable keeps state under ./data by default (funnel.db and uploads/).
Set FUNNEL_DATA_DIR to use another directory. Copy .env.example to .env, then
set FUNNEL_SECRET (generate one with \`openssl rand -base64 32\`).

Health probes: /healthz (liveness) and /readyz (readiness).
Apply migrations without starting the server: ./funnel --migrate

Funnel is a single-instance application. Do not scale it horizontally or run
two instances against the same data directory.

Documentation: https://github.com/t128n/funnel/tree/main/docs
`;

writeFileSync(join(stageDir, "README.txt"), readme);

/** Quote a PowerShell literal string (single quotes are escaped by doubling). */
function psLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// Packaging runs natively on each platform: gzipped tar on macOS/Linux and
// Compress-Archive on Windows. Both archives contain the same top-level folder.
const archive = isWindows
  ? Bun.spawnSync({
      cmd: [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -LiteralPath ${psLiteral(stageDir)} -DestinationPath ${psLiteral(archivePath)} -Force`,
      ],
      stdout: "inherit",
      stderr: "inherit",
    })
  : Bun.spawnSync({
      cmd: ["tar", "-czf", archivePath, "-C", stageRoot, archiveName],
      stdout: "inherit",
      stderr: "inherit",
    });

if ((archive.exitCode ?? 1) !== 0) {
  fail(`archive command failed with exit code ${archive.exitCode}`);
}

const bytes = readFileSync(archivePath);
const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
writeFileSync(
  `${archivePath}.sha256`,
  `${digest}  ${basename(archivePath)}\n`,
);

rmSync(stageRoot, { recursive: true, force: true });

console.log(
  `[package] ${archivePath} (${(statSync(archivePath).size / 1024 / 1024).toFixed(1)} MiB)`,
);
console.log(`[package] sha256 ${digest}`);
