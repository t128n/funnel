/**
 * Assemble one platform's GitHub release archives.
 *
 * Usage:
 *   bun scripts/package-release.ts --version=0.0.1 --platform=linux-x64
 *                                   [--bin=dist/funnel] [--outdir=release]
 *
 * The server archive contains the self-contained `funnel` executable. Windows
 * also gets a separate archive for the optional per-user intake hotkey helper.
 *
 * Each archive has a corresponding `.sha256`; the release workflow
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
  // WinSW must remain a sibling of funnel.exe for service installation.
  stageFile("packaging/windows/setup.cmd", "START-HERE.cmd");

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
  ? `Funnel ${version}
===============================

Self-contained server. The Bun runtime, SvelteKit server, client assets, native
Markdown addon and database migrations are embedded in funnel.exe; no Bun,
Node.js, or container runtime is required.

Guided setup (recommended):

  Double-click START-HERE.cmd, or run:
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

Setup creates the config with a generated FUNNEL_SECRET and preserves an
existing secret; the Windows service is installed only when selected.
Uninstall keeps data and configuration unless you add --purge.

The optional per-user intake hotkey helper is a separate download:
funnel-intake-${version}-${platform}.zip.

Health probes: /healthz (liveness) and /readyz (readiness).
Apply migrations without starting the server: .\\funnel.exe --migrate

Funnel is a single-instance application. Do not scale it horizontally or run
two instances against the same data directory.

Documentation: https://github.com/t128n/funnel/tree/main/docs
`
  : `Funnel ${version}
===============================

Self-contained server. The Bun runtime, SvelteKit server, client assets, native
Markdown addon and database migrations are embedded in this executable; no
Bun, Node.js, or container runtime is required.

Guided setup (recommended):

  ./funnel setup
  ./funnel status

Choose a system service, user service, or portable process. Setup creates
configuration with a generated FUNNEL_SECRET and prints the onboarding URL.
For a manually started process, state defaults to ./data; copy .env.example
to .env and set FUNNEL_SECRET (generate one with \`openssl rand -base64 32\`).

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

// Packaging runs natively: gzipped tar on macOS/Linux and ZIP on Windows.
function packageArchive(name: string, dir: string, extension: string): void {
  const path = join(outDir, `${name}.${extension}`);
  rmSync(path, { force: true });
  const archive = isWindows
    ? Bun.spawnSync({
        cmd: [
          "powershell", "-NoProfile", "-NonInteractive", "-Command",
          `Compress-Archive -LiteralPath ${psLiteral(dir)} -DestinationPath ${psLiteral(path)} -Force`,
        ],
        stdout: "inherit",
        stderr: "inherit",
      })
    : Bun.spawnSync({
        cmd: ["tar", "-czf", path, "-C", stageRoot, name],
        stdout: "inherit",
        stderr: "inherit",
      });

  if ((archive.exitCode ?? 1) !== 0) {
    fail(`archive command failed with exit code ${archive.exitCode}`);
  }

  const digest = new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex");
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`);
  console.log(`[package] ${path} (${(statSync(path).size / 1024 / 1024).toFixed(1)} MiB)`);
  console.log(`[package] sha256 ${digest}`);
}

packageArchive(archiveName, stageDir, archiveExtension);

if (isWindows) {
  const intakePath = join(projectRoot, "dist", "funnel-intake.exe");
  if (!existsSync(intakePath)) {
    fail("dist/funnel-intake.exe is missing; run `bun scripts/build-intake.ts` before packaging the Windows archives.");
  }
  const intakeName = `funnel-intake-${version}-${platform}`;
  const intakeDir = join(stageRoot, intakeName);
  mkdirSync(intakeDir, { recursive: true });
  copyFileSync(intakePath, join(intakeDir, "funnel-intake.exe"));
  copyFileSync(join(projectRoot, "scripts", "install-intake.ps1"), join(intakeDir, "install-intake.ps1"));
  if (existsSync(notices)) copyFileSync(notices, join(intakeDir, "THIRD_PARTY_NOTICES.md"));
  writeFileSync(join(intakeDir, "README.txt"), `Funnel Intake ${version}
====================

Optional per-user Windows hotkey helper. Requires a reachable Funnel server.
Extract this archive, open PowerShell in this folder, and run:

  powershell -ExecutionPolicy Bypass -File .\\install-intake.ps1 -Url http://localhost:3000

Replace the URL with your Funnel server address. No administrator rights are needed.
Select text in Teams, Outlook, or a browser and press Ctrl+Alt+I to open an intake draft.

To uninstall, run:
  powershell -ExecutionPolicy Bypass -File .\\install-intake.ps1 -Uninstall

Documentation: https://github.com/t128n/funnel/blob/main/docs/how-to/integrate/windows-intake-hotkey.md
`);
  packageArchive(intakeName, intakeDir, "zip");
}

rmSync(stageRoot, { recursive: true, force: true });
