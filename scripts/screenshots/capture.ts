/**
 * Capture the fifteen cockpit views in light and dark at 1440×900 (DPR 2).
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
import { chromium, type BrowserContext, type Page } from "playwright";
import { DEFAULT_SECRET } from "./seed";

/**
 * The twelve views captured for the design gallery.
 *
 * `ready` is the hydration contract: a selector that only exists once the
 * client-side data view has painted. Without it the capture can frame a
 * loading spinner or a bare table header on a cold context. Views with a
 * `click` open a popover first and then wait for `readyAfter` before framing.
 */
export const VIEWS = [
  {
    name: "issues",
    path: "/issues",
    ready: ".table-responsive tbody tr",
  },
  {
    name: "issue",
    path: "/issues/acme/widgets/1",
    ready: '[aria-label="Issue"] h1',
  },
  {
    name: "issue-activity",
    path: "/issues/acme/widgets/1",
    ready: '[aria-label="Issue"] h1',
    scrollTo: "Activity",
  },
  { name: "board", path: "/board", ready: "[data-board-card] h3" },
  {
    name: "plan",
    path: "/plan",
    ready: '[data-testid="plan-table"]',
  },
  { name: "epics", path: "/epics", ready: 'a[href^="/epics/"]' },
  {
    name: "milestones",
    path: "/milestones",
    ready: 'a[href^="/milestones/"]',
  },
  {
    name: "timeline",
    path: "/timeline",
    ready: '[data-testid="timeline-chart"]',
  },
  {
    name: "attention",
    path: "/attention",
    ready: 'a[href^="/issues/acme/"]',
  },
  {
    name: "inbox",
    path: "/inbox",
    ready: "table tbody tr",
  },
  {
    name: "notifications",
    path: "/notifications",
    ready: "h1",
  },
  {
    name: "settings-appearance",
    path: "/settings/appearance",
    ready: "h1, h2",
  },
  {
    name: "settings-repositories",
    path: "/settings/repositories",
    ready: "h1",
  },
  {
    name: "matrix",
    path: "/matrix",
    ready: '[data-testid="matrix-grid"]',
  },
  {
    name: "settings-planning",
    path: "/settings/planning",
    ready: "h1",
  },
  {
    name: "intake",
    path: "/intake",
    ready: "form",
  },
] as const;

export type CaptureTheme = "light" | "dark";

export interface CaptureOptions {
  baseUrl?: string;
  outDir: string;
  /** `name=value` from `seed.ts` (already URL-encoded once). */
  cookie: string;
  /** Device pixel ratio; 2 for the committed gallery, 1 for lighter previews. */
  scale?: number;
  /** CSS viewport; defaults to the desktop 1440×900 gallery frame. */
  viewport?: { width: number; height: number };
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
    [
      "--bun",
      "vite",
      "dev",
      "--port",
      String(DEV_PORT),
      "--strictPort",
      // Bind IPv4 explicitly: on hosts where `localhost` resolves to `::1`
      // first, Vite listens on IPv6 only and the 127.0.0.1 health check
      // below never connects.
      "--host",
      "127.0.0.1",
    ],
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

/**
 * Wait for a view's hydration contract, then (for the issue detail) for the
 * client-side fetch to replace the spinner with the metadata table.
 *
 * A selector that never appears is a harness failure, not a blank screenshot:
 * the error names the view so a broken contract is obvious.
 */
async function waitForView(
  page: Page,
  view: (typeof VIEWS)[number],
): Promise<void> {
  try {
    await page.waitForSelector(view.ready, { timeout: 30_000 });
  } catch {
    throw new Error(
      `View ${view.name} did not become ready: ${view.ready} never appeared`,
    );
  }

  if (
    view.name === "issue" ||
    view.name === "issue-activity" ||
    view.name === "priority-guidance"
  ) {
    try {
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Issue"]')
            ?.querySelector('[aria-label="Loading issue"]') === null,
        undefined,
        { timeout: 30_000 },
      );
    } catch {
      throw new Error(
        `View ${view.name} did not finish loading the issue detail (spinner still present)`,
      );
    }
  }

  if ("click" in view && view.click) {
    await page.click(view.click);
  }

  if ("readyAfter" in view && view.readyAfter) {
    try {
      await page.waitForSelector(view.readyAfter, { timeout: 30_000 });
    } catch {
      throw new Error(
        `View ${view.name} did not become ready after click: ${view.readyAfter} never appeared`,
      );
    }
  }

  if ("scrollTo" in view && view.scrollTo) {
    await page.evaluate((heading) => {
      const target = [...document.querySelectorAll("h2")].find(
        (node) => node.textContent?.trim() === heading,
      );
      target?.scrollIntoView({ block: "start" });
    }, view.scrollTo);
    await page.waitForTimeout(250);
  }
}

/** Build one theme's browser context with the cookie and theme preset. */
async function createContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseUrl: string,
  cookie: string,
  theme: CaptureTheme,
  scale: number,
  viewport: { width: number; height: number },
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
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
  scale = 2,
  viewport = { width: 1440, height: 900 },
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
      const context = await createContext(browser, baseUrl, cookie, theme, scale, viewport);
      try {
        for (const view of VIEWS) {
          const page = await context.newPage();
          try {
            await page.emulateMedia({ colorScheme: theme });
            await page.goto(`${baseUrl}${view.path}`, {
              waitUntil: "load",
              timeout: 120_000,
            });
            await waitForView(page, view);
            // Let the last hydration paint settle before the frame is taken.
            await page.waitForTimeout(1200);
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
  const scale = Number(option("scale") ?? "2");
  const width = Number(option("width") ?? "1440");
  const height = Number(option("height") ?? "900");
  if (!outDir || !cookie) {
    console.error(
      "Usage: bun scripts/screenshots/capture.ts --out <dir> --cookie <name=value> [--base-url <url>] [--db <path>] [--secret <secret>] [--scale <n>] [--width <px>] [--height <px>]",
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
    scale: Number.isFinite(scale) && scale > 0 ? scale : 2,
    viewport: {
      width: Number.isFinite(width) && width > 0 ? width : 1440,
      height: Number.isFinite(height) && height > 0 ? height : 900,
    },
  });
  console.log(`${files.length} captures written to ${outDir}`);
}
