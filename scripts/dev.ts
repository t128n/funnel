#!/usr/bin/env bun
/**
 * Dev-server launcher for Funnel.
 *
 * `bun run dev` spawns Vite unchanged. `bun run dev:demo` adds `--demo`, which
 * switches the child to a seeded SQLite database, a separate upload directory
 * and the dev-only placeholder secret — all without touching a real
 * installation. `--demo` is stripped from the arguments forwarded to Vite.
 *
 * Signals are forwarded so Ctrl-C still stops the parent cleanly; the parent
 * exits with the child's status.
 */
import { spawn } from "node:child_process";

const DEMO_DB = "./data/demo.db";
const DEMO_UPLOAD_DIR = "./data/demo-uploads";
const DEMO_SECRET = "demo-only-secret-0123456789abcdef0123456789abcdef";

const args = process.argv.slice(2);
const demo = args.includes("--demo");
const forwarded = args.filter((arg) => arg !== "--demo");

const env: NodeJS.ProcessEnv = { ...process.env };
if (demo) {
  env.FUNNEL_DEMO = "1";
  env.FUNNEL_DB ??= DEMO_DB;
  env.FUNNEL_UPLOAD_DIR ??= DEMO_UPLOAD_DIR;
  env.FUNNEL_SECRET ??= DEMO_SECRET;
}

const child = spawn("bun", ["--bun", "vite", "dev", ...forwarded], {
  stdio: "inherit",
  env,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
