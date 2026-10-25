#!/usr/bin/env bun
/**
 * Dev-server launcher for Funnel.
 *
 * `bun run dev` spawns Vite unchanged. `bun run dev:demo` adds `--demo`, which
 * switches the child to a seeded SQLite database, a separate upload directory
 * and the dev-only placeholder secret — all without touching a real
 * installation. `--demo` is stripped from the arguments forwarded to Vite.
 *
 * Inherited values count as unset when they are empty or whitespace: a plain
 * `cp .env.example .env` leaves `FUNNEL_SECRET=` behind, and an empty secret
 * would fail validation instead of using the demo placeholder.
 *
 * Signals are forwarded so Ctrl-C still stops the parent cleanly; the parent
 * exits with the child's status.
 */
import { spawn } from "node:child_process";

const DEMO_DB = "./data/demo.db";
const DEMO_UPLOAD_DIR = "./data/demo-uploads";
const DEMO_SECRET = "demo-only-secret-0123456789abcdef0123456789abcdef";

/** Whether an inherited variable should take the demo default. */
function isUnset(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * The environment handed to the Vite child.
 *
 * With `demo` the flag is forced on and the demo database, upload directory
 * and dev-only secret fill in every missing or blank value. Without it the
 * inherited environment passes through untouched.
 */
export function devEnvironment(
  base: NodeJS.ProcessEnv,
  demo: boolean,
): NodeJS.ProcessEnv {
  const env = { ...base };
  if (!demo) return env;
  env.FUNNEL_DEMO = "1";
  if (isUnset(env.FUNNEL_DB)) env.FUNNEL_DB = DEMO_DB;
  if (isUnset(env.FUNNEL_UPLOAD_DIR)) env.FUNNEL_UPLOAD_DIR = DEMO_UPLOAD_DIR;
  if (isUnset(env.FUNNEL_SECRET)) env.FUNNEL_SECRET = DEMO_SECRET;
  return env;
}

function run(): void {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const forwarded = args.filter((arg) => arg !== "--demo");

  const child = spawn("bun", ["--bun", "vite", "dev", ...forwarded], {
    stdio: "inherit",
    env: devEnvironment(process.env, demo),
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (import.meta.main) run();
