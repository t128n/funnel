/**
 * Standalone (single-file executable) build.
 *
 * Wraps `Bun.build({ compile })` so the whole server — adapter-node output,
 * every `node_modules` dependency, the SvelteKit client assets, and the
 * committed migrations — is embedded into one executable.
 *
 * Usage:
 *   bun scripts/build-standalone.ts [--target=bun-windows-x64]
 *                                   [--outdir=dist] [--outfile=funnel.exe]
 *
 * Cross-target notes: the target's satteri platform package must be installed
 * (see `scripts/standalone/satteri-binding.ts`), so building natively per OS is
 * the reliable path. `--target` defaults to the host.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { hostTarget, satteriBindingPlugin } from "./standalone/satteri-binding";

const projectRoot = process.cwd();

const pkg = (await Bun.file(join(projectRoot, "package.json")).json()) as {
  version?: string;
};

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit?.slice(prefix.length);
}

const target = argValue("--target") ?? hostTarget();
const outDir = resolve(projectRoot, argValue("--outdir") ?? "dist");
const outName =
  argValue("--outfile") ?? (target.includes("windows") ? "funnel.exe" : "funnel");
const outfile = join(outDir, outName);

if (!existsSync(join(projectRoot, "build", "index.js"))) {
  console.error(
    "[standalone] build/index.js is missing — run `bun run build` first.",
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

/**
 * Embedded relative to the entrypoint, so `build/client` lands next to the
 * compiled server exactly where adapter-node's `dir` (the directory of
 * `build/adapter-node.js`) looks for it. `build/prerendered` only exists when
 * the app prerenders something; skip it when absent.
 */
const assets = ["build/client", "build/prerendered", "drizzle"].filter((path) =>
  existsSync(join(projectRoot, path)),
);

/**
 * Adapter-node streams static files with `fs.createReadStream`. Bun's compiled
 * filesystem exposes embedded assets through `readFileSync` and `Bun.file`, but
 * `createReadStream` cannot open a `$bunfs` path — the asset table resolves, the
 * response starts, and the stream then fails with ENOENT, producing an empty
 * CSS/JS response. Replace only that one expression with a buffered stream.
 *
 * The pattern is pinned; if adapter-node changes it, fail the build rather than
 * shipping an executable whose assets 200 with an empty body.
 */
function patchAdapterNodeStaticStreaming(): void {
  const handlerPath = join(
    projectRoot,
    "build",
    "server",
    "adapter-node-handler.js",
  );
  if (!existsSync(handlerPath)) {
    console.error(
      "[standalone] build/server/adapter-node-handler.js is missing — run `bun run build` first.",
    );
    process.exit(1);
  }

  const source = readFileSync(handlerPath, "utf8");
  const original = "pipeline(fs.createReadStream(file, range), res, () => {});";
  const patched =
    "pipeline(Readable.from([range.start === undefined ? fs.readFileSync(file) : fs.readFileSync(file).subarray(range.start, range.end + 1)]), res, () => {});";

  if (source.includes(patched)) return;

  if (!source.includes(original)) {
    console.error(
      "[standalone] adapter-node's static handler changed; update the embedded-asset streaming patch in scripts/build-standalone.ts.",
    );
    process.exit(1);
  }

  writeFileSync(handlerPath, source.replace(original, patched));
  console.log("[standalone] patched adapter-node static streaming for embedded assets");
}

patchAdapterNodeStaticStreaming();

/**
 * Adapter-node defaults the request scheme to `https` when `PROTOCOL_HEADER` is
 * unset, because it assumes it sits behind a TLS-terminating proxy. The
 * packaged executable is often opened directly at `http://127.0.0.1:3000`, so
 * that default makes SvelteKit's self-origin `https://…` while the browser's
 * `Origin` is `http://…`; every form POST then fails the CSRF check.
 *
 * Two runtime changes, both in generated adapter files:
 * - use `FUNNEL_URL` as the canonical origin when the operator set it (this
 *   also keeps CSRF and generated URLs correct behind a proxy);
 * - otherwise default the scheme to `http`, which is what this server actually
 *   speaks. Proxy operators already set `PROTOCOL_HEADER` (see the reverse
 *   proxy guide), so the header still wins when present.
 */
function patchAdapterNodeOrigin(): void {
  const adapterPath = join(projectRoot, "build", "adapter-node.js");
  const handlerPath = join(
    projectRoot,
    "build",
    "server",
    "adapter-node-handler.js",
  );

  for (const path of [adapterPath, handlerPath]) {
    if (!existsSync(path)) {
      console.error(
        `[standalone] ${path} is missing — run \`bun run build\` first.`,
      );
      process.exit(1);
    }
  }

  const adapterSource = readFileSync(adapterPath, "utf8");
  const adapterOriginal = "export const origin = undefined;";
  const adapterPatched =
    'export const origin = process.env.FUNNEL_URL?.replace(/\\/$/, "") || undefined;';

  if (!adapterSource.includes(adapterPatched)) {
    if (!adapterSource.includes(adapterOriginal)) {
      console.error(
        "[standalone] adapter-node's origin export changed; update the origin patch in scripts/build-standalone.ts.",
      );
      process.exit(1);
    }
    writeFileSync(
      adapterPath,
      adapterSource.replace(adapterOriginal, adapterPatched),
    );
  }

  const handlerSource = readFileSync(handlerPath, "utf8");
  const protocolOriginal =
    'const protocol = decodeURIComponent(normalise_header(protocol_header, headers[protocol_header]) || "https");';
  const protocolPatched =
    'const protocol = decodeURIComponent(normalise_header(protocol_header, headers[protocol_header]) || "http");';

  if (!handlerSource.includes(protocolPatched)) {
    if (!handlerSource.includes(protocolOriginal)) {
      console.error(
        "[standalone] adapter-node's origin detection changed; update the origin patch in scripts/build-standalone.ts.",
      );
      process.exit(1);
    }
    writeFileSync(
      handlerPath,
      handlerSource.replace(protocolOriginal, protocolPatched),
    );
  }

  console.log("[standalone] patched adapter-node origin detection for direct HTTP");
}

patchAdapterNodeOrigin();

/**
 * The generated entrypoint lives in `src/` (so Bun resolves `assets` and the
 * adapter-node server paths exactly as it does in a normal build) but is
 * excluded from the TypeScript project — its `../build/index.js` import would
 * otherwise pull the whole generated tree into `svelte-check`. It is written
 * just for the duration of the build and removed afterwards.
 */
const entryPath = join(projectRoot, "src", "standalone-entry.ts");
const entrySource = `// Generated by scripts/build-standalone.ts — do not edit, not type-checked.
import { runStandalone } from "./standalone.ts";

await runStandalone();

// Loaded last: it validates the environment and starts listening.
await import("../build/index.js");
`;

console.log(
  `[standalone] target=${target} assets=${assets.join(", ")} -> ${outfile}`,
);

let result: Awaited<ReturnType<typeof Bun.build>> | undefined;
let failure: unknown;
writeFileSync(entryPath, entrySource);
try {
  result = await Bun.build({
    entrypoints: ["./src/standalone-entry.ts"],
    compile: {
      target: target as Bun.Build.CompileTarget,
      outfile,
      assets,
    },
    minify: true,
    sourcemap: "linked",
    define: { __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0") },
    plugins: [satteriBindingPlugin({ projectRoot, target })],
  });
} catch (error) {
  failure = error;
} finally {
  rmSync(entryPath, { force: true });
}

if (failure) {
  console.error(
    `[standalone] ${failure instanceof Error ? failure.message : String(failure)}`,
  );
  process.exit(1);
}

if (!result?.success) {
  for (const log of result?.logs ?? []) console.error(log);
  console.error("[standalone] build failed");
  process.exit(1);
}

const bytes = statSync(outfile).size;
console.log(
  `[standalone] done: ${outfile} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`,
);
