/**
 * Download and verify the pinned WinSW service host for packaging.
 *
 * Usage:
 *   bun scripts/fetch-winsw.ts [--force]
 *
 * Writes vendor/winsw/WinSW.NET461.exe. The binary is not committed; CI and
 * release packaging run this script before building the standalone executable.
 * The installer never downloads WinSW at install time.
 */
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  sha256File,
  WINSW_ASSET,
  WINSW_DOWNLOAD_URL,
  WINSW_SHA256,
  WINSW_VERSION,
  WINSW_VENDOR_PATH,
} from "../src/installer/platform/winsw";

const projectRoot = resolve(import.meta.dir, "..");
const destination = join(projectRoot, WINSW_VENDOR_PATH);
const force = process.argv.includes("--force");

if (!force && existsSync(destination)) {
  const actual = sha256File(destination);
  if (actual === WINSW_SHA256) {
    console.log(
      `[fetch-winsw] ${WINSW_ASSET} ${WINSW_VERSION} already present and verified (${WINSW_SHA256}).`,
    );
    process.exit(0);
  }
  console.warn(
    `[fetch-winsw] Existing ${destination} does not match the pinned hash; downloading a fresh copy.`,
  );
}

mkdirSync(dirname(destination), { recursive: true });
const temporary = `${destination}.tmp-${process.pid}`;

try {
  console.log(`[fetch-winsw] Downloading ${WINSW_DOWNLOAD_URL}`);
  const response = await fetch(WINSW_DOWNLOAD_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Download failed: HTTP ${response.status} ${response.statusText} for ${WINSW_DOWNLOAD_URL}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await Bun.write(temporary, buffer);

  const actual = sha256File(temporary);
  if (actual !== WINSW_SHA256) {
    throw new Error(
      `SHA-256 mismatch for ${WINSW_ASSET} ${WINSW_VERSION}.\n` +
        `Expected: ${WINSW_SHA256}\n` +
        `Actual:   ${actual}\n` +
        `Refusing to install an unverified service host. Check whether the release asset changed or the download was tampered with.`,
    );
  }

  renameSync(temporary, destination);
  const size = statSync(destination).size;
  console.log(
    `[fetch-winsw] Wrote ${destination} (${(size / 1024).toFixed(0)} KiB, SHA-256 ${actual}).`,
  );
} catch (error) {
  console.error(
    `[fetch-winsw] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(temporary, { force: true });
}
