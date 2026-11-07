/**
 * Build the GitHub release body from the Changesets changelog.
 *
 * Usage:
 *   bun scripts/release-notes.ts --version=0.0.2
 *
 * Prints the `## <version>` section of `CHANGELOG.md`, then the download and
 * run sections shared by every release. Exits non-zero when the changelog has
 * no entry for the version (for example, the initial 0.0.1 release predates
 * Changesets), so the publish workflow can fall back to a hand-written notes
 * file or GitHub-generated notes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const version = argValue("--version");
if (!version) {
  console.error("[release-notes] --version is required (for example --version=0.0.2)");
  process.exit(1);
}

const changelogPath = join(projectRoot, "CHANGELOG.md");
if (!existsSync(changelogPath)) {
  console.error(`[release-notes] ${changelogPath} is missing.`);
  process.exit(1);
}

const lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);
const heading = `## ${version}`;

let start = -1;
let end = lines.length;
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index].trimEnd();
  if (start === -1) {
    if (line === heading) start = index + 1;
    continue;
  }
  if (line.startsWith("## ")) {
    end = index;
    break;
  }
}

const entry = start === -1 ? "" : lines.slice(start, end).join("\n").trim();
if (!entry) {
  console.error(`[release-notes] no changelog entry for ${version}.`);
  process.exit(1);
}

// 0.0.x is the pre-release line; 0.1.0 is the first normal release. A suffix
// such as 0.1.0-rc.1 is still a pre-release.
const preRelease = /^0\.0\.\d+$/.test(version) || version.includes("-");
const preReleaseNote = preRelease
  ? "\n> This is a pre-release build from the 0.0.x line. Expect breaking changes before 0.1.0.\n"
  : "";

const body = `## What's changed

${entry}

## Downloads

| Platform | Asset |
| :--- | :--- |
| Linux x64 (glibc) | \`funnel-${version}-linux-x64.tar.gz\` |
| Linux arm64 (glibc) | \`funnel-${version}-linux-arm64.tar.gz\` |
| macOS Apple silicon | \`funnel-${version}-darwin-arm64.tar.gz\` |
| macOS Intel | \`funnel-${version}-darwin-x64.tar.gz\` |
| Windows x64 server | \`funnel-${version}-windows-x64.zip\` |
| Windows x64 optional intake hotkey | \`funnel-intake-${version}-windows-x64.zip\` |

Each Linux and macOS archive contains the self-contained \`funnel\` executable
and \`.env.example\`. The Windows server archive includes the setup launcher and
service wrapper. The optional intake download installs a per-user hotkey helper;
it requires a reachable Funnel server. The server executable embeds Bun, the
server, client assets, the native Markdown addon, and the database migrations.
${preReleaseNote}
## Verify

\`\`\`sh
sha256sum -c SHA256SUMS.txt
\`\`\`

## Run

Linux and macOS: extract the archive and run \`./funnel setup\`. The wizard
creates the config from \`.env.example\`, generates \`FUNNEL_SECRET\`, installs a
systemd or launchd service (or runs a portable process), and opens onboarding.

Windows: extract the archive and double-click \`START-HERE.cmd\` (or run
\`.\\funnel.exe setup\`). The wizard creates the config, installs the Windows
service or starts a portable copy, and opens onboarding. The executable
remains available for manual \`funnel\` runs. For the optional hotkey helper,
download the separate intake archive and follow its README.

See the [getting started guide](https://github.com/t128n/funnel/blob/main/docs/tutorials/getting-started.md)
for the GitHub App onboarding flow and the [deployment guides](https://github.com/t128n/funnel/blob/main/docs/README.md#how-to-guides)
for production setup.
`;

process.stdout.write(body);
