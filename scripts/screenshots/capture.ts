/**
 * Capture the nine cockpit views in light and dark at 1440×900 (DPR 2).
 *
 * This script runs outside Vite, so it must not import `$app/*` or `#lib/*`.
 * It seeds nothing itself; pair it with `seed.ts`:
 *
 *   COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
 *   bun scripts/screenshots/capture.ts \
 *     --base-url http://127.0.0.1:5199 \
 *     --out /tmp/funnel-shots/out --cookie "$COOKIE"
 *
 * With `--base-url` omitted it starts `vite dev` on port 5199 itself (the
 * server needs `FUNNEL_DB` and `FUNNEL_SECRET`) and stops only that child.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext } from "playwright";
import { DEFAULT_SECRET } from "./seed";

/** The nine views captured for the design gallery. */
export const VIEWS = [
  { name: "issues", path: "/issues" },
  { name: "issue", path: "/issues/acme/widgets/1" },
  { name: "board", path: "/board" },
  { name: "plan", path: "/plan" },
  { name: "epics", path: "/epics" },
  { name: "milestones", path: "/milestones" },
  { name: "attention", path: "/attention" },
  { name: "inbox", path: "/inbox" },
  { name: "settings-appearance", path: "/settings/appearance" },
] as const;

export type CaptureTheme = "light" | "dark";

export interface CaptureOptions {
  baseUrl?: string;
  outDir: string;
  /** `name=value` from `seed.ts` (already URL-encoded once). */
  cookie: string;
}

export interface CaptureResult {
  files: string[];
}

/** Development server defaults; matches the plan's probe entry. */
const DEV_PORT = 5199;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;

/** Where `bunx playwright install chromium` puts the browser. */
const DEFAULT_CHROMIUM = join(
  homedir(),
  ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
);

/** Split `name=value` at the first `=`, keeping any `=` in the value. */
function splitCookie(cookie: string): { name: string; value: string } {
  const index = cookie.indexOf("=");
  if (index <= 0) throw new Error("Cookie must be in `name=value` form");
  return { name: cookie.slice(0, index), value: cookie.slice(index + 1) };
}

/** Resolve the seeded Chromium, falling back to Playwright's own download. */
function chromiumExecutable(): string | undefined {
  const override = process.env.FUNNEL_CHROMIUM;
  if (override) return override;
  return existsSync(DEFAULT_CHROMIUM) ? DEFAULT_CHROMIUM : undefined;
}

/** Resolve `capture.ts`'s repository root for `vite dev`'s cwd. */
function repositoryRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}

/** Wait until the dev server answers its liveness probe. */
async function waitForServer(baseUrl: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Still starting (or not listening yet).
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

/** Stop only the child this process spawned. */
async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
  await Promise.race([exited, timeout]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

/** Spawn `vite dev` on 5199 with the environment the server needs. */
function startServer(): ChildProcess {
  const dbPath = process.env.FUNNEL_DB;
  const secret = process.env.FUNNEL_SECRET ?? DEFAULT_SECRET;
  if (!dbPath) {
    throw new Error(
      "FUNNEL_DB is required to start the dev server; run with --base-url to use an existing one",
    );
  }

  const child = spawn(
    "bun",
    ["--bun", "vite", "dev", "--port", String(DEV_PORT), "--strictPort"],
    {
      cwd: repositoryRoot(),
      env: {
        ...process.env,
        FUNNEL_DB: dbPath,
        FUNNEL_SECRET: secret,
        FUNNEL_URL: DEV_URL,
        GITHUB_URL: process.env.GITHUB_URL ?? "https://github.com",
        GITHUB_API_URL: process.env.GITHUB_API_URL ?? "http://127.0.0.1:9",
        LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  child.once("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`vite dev exited with code ${code} (signal ${signal ?? "none"})`);
    }
  });

  return child;
}

/** Build one theme's browser context with the cookie and theme preset. */
async function createContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  cookie: string,
  theme: CaptureTheme,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });

  const { name, value } = splitCookie(cookie);
  const { hostname } = new URL(baseUrl);
  await context.addCookies([
    {
      name,
      value,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await context.addInitScript((choice: string) => {
    try {
      localStorage.setItem("funnel:theme", choice);
    } catch {
      // A non-http origin has no localStorage; the capture still proceeds.
    }
  }, theme);

  return context;
}

/**
 * Capture every view in both themes.
 *
 * The output directory is created recursively. Files are named
 * `<view>-<theme>.png`, at 1440×900 CSS pixels and DPR 2.
 */
export async function captureAll({
  baseUrl: requestedBaseUrl,
  outDir,
  cookie,
}: CaptureOptions): Promise<CaptureResult> {
  const baseUrl = requestedBaseUrl ?? DEV_URL;
  const server = requestedBaseUrl ? null : startServer();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const files: string[] = [];

  try {
    if (server) await waitForServer(baseUrl);
    mkdirSync(outDir, { recursive: true });

    const executablePath = chromiumExecutable();
    browser = await chromium.launch(executablePath ? { executablePath } : {});

    for (const theme of ["light", "dark"] as const) {
      const context = await createContext(browser, baseUrl, cookie, theme);
      try {
        for (const view of VIEWS) {
          const page = await context.newPage();
          try {
            await page.emulateMedia({ colorScheme: theme });
            await page.goto(`${baseUrl}${view.path}`, {
              waitUntil: "load",
              timeout: 120_000,
            });
            // Client-side feeds (and the issue detail fetch) hydrate after the
            // load event; give them a beat without waiting on the SSE stream,
            // which never goes idle.
            await page.waitForTimeout(1_200);
            await page.evaluate(() => document.fonts.ready);

            const file = join(outDir, `${view.name}-${theme}.png`);
            await page.screenshot({ path: file, type: "png" });
            files.push(file);
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    if (server) await stopServer(server);
  }

  return { files };
}

/** Read `--name value` from argv. */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (import.meta.main) {
  const outDir = option("out");
  const cookie = option("cookie");
  if (!outDir || !cookie) {
    console.error(
      "Usage: bun scripts/screenshots/capture.ts --out <dir> --cookie <name=value> [--base-url <url>] [--db <path>] [--secret <secret>]",
    );
    process.exit(1);
  }

  // Flags exist for the self-starting path; harmless when --base-url is given.
  const db = option("db");
  if (db) process.env.FUNNEL_DB = db;
  const secret = option("secret");
  if (secret) process.env.FUNNEL_SECRET = secret;

  const { files } = await captureAll({
    baseUrl: option("base-url"),
    outDir,
    cookie,
  });
  console.log(`${files.length} captures written to ${outDir}`);
}
