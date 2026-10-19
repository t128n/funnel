/**
 * Bun bundler plugin that makes `satteri`'s NAPI-RS binding statically
 * resolvable, so `bun build --compile` can embed the platform `.node`.
 *
 * `satteri` ships the usual NAPI-RS loader: a chain of runtime
 * `try { require('./satteri_napi.<platform>.node') } catch { require('@bruits/
 * satteri-<platform>') } catch { … WASI … }`. A bundler cannot follow that
 * (the paths are chosen at runtime from `process.platform`/`arch`), so the
 * compiled executable ends up asking for a module that is not in its virtual
 * filesystem — the classic "Cannot find native binding" failure.
 *
 * Every internal consumer imports the native functions through the package's
 * own `#binding` specifier. We intercept exactly that specifier and replace it
 * with a static re-export of the addon for the build target, which Bun then
 * embeds.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import type { BunPlugin } from "bun";

/**
 * Bun compile target → the suffix NAPI-RS uses for both the optional package
 * (`@bruits/satteri-<suffix>`) and the addon filename
 * (`satteri_napi.<suffix>.node`).
 */
const PLATFORM_SUFFIXES: Record<string, string> = {
  "bun-windows-x64": "win32-x64-msvc",
  "bun-windows-arm64": "win32-arm64-msvc",
  "bun-linux-x64": "linux-x64-gnu",
  "bun-linux-arm64": "linux-arm64-gnu",
  "bun-linux-x64-musl": "linux-x64-musl",
  "bun-linux-arm64-musl": "linux-arm64-musl",
  "bun-darwin-x64": "darwin-x64",
  "bun-darwin-arm64": "darwin-arm64",
};

/** The Bun compile target for the host, used when none is given explicitly. */
export function hostTarget(): string {
  const os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  return `bun-${os}-${process.arch}`;
}

/**
 * Resolve the absolute path of the `.node` addon for a compile target.
 *
 * The target's optional dependency must be installed (`bun install` only
 * fetches the host's by default; cross-building needs the target's package
 * present). Throws with an actionable message when it is missing.
 */
export function resolveSatteriBinding(projectRoot: string, target: string): string {
  const suffix = PLATFORM_SUFFIXES[target];
  if (!suffix) {
    throw new Error(
      `satteri: unsupported standalone target "${target}". Supported: ${Object.keys(PLATFORM_SUFFIXES).join(", ")}`,
    );
  }

  const packageName = `@bruits/satteri-${suffix}`;
  const require = createRequire(join(projectRoot, "package.json"));
  try {
    // The optional package's `main` is the addon itself.
    return require.resolve(packageName);
  } catch {
    const platform = target.replace("bun-", "").replace(/-/g, " ");
    throw new Error(
      `satteri: the platform package "${packageName}" is not installed, so a "${target}" executable cannot be built here. ` +
        `Build on ${platform} (recommended), or install that platform's optional dependency first.`,
    );
  }
}

/**
 * Native exports `satteri`'s JavaScript consumes through `#binding`. Used as a
 * fallback when the addon cannot be introspected (e.g. cross-building, where
 * loading a foreign `.node` is impossible).
 */
const FALLBACK_EXPORTS = [
  "applyCommandsAndCompileHandle",
  "applyCommandsAndConvertToHastHandle",
  "applyCommandsAndRenderHandle",
  "applyCommandsToHandle",
  "applyCommandsToMdastHandle",
  "applyMdastCommandsAndConvertAndCompile",
  "applyMdastCommandsAndConvertAndRender",
  "compileHandle",
  "compileMdx",
  "convertMdastToHastHandle",
  "createHastHandle",
  "createHastHandleFromHtml",
  "createHastHandleWithFrontmatter",
  "createMdastHandle",
  "createMdxHastHandle",
  "createMdxHastHandleWithFrontmatter",
  "createMdxMdastHandle",
  "dropHandle",
  "getHandleSource",
  "getMdastFrontmatter",
  "getNodeData",
  "markdownToHtmlFast",
  "markdownToJsFast",
  "mdastTextContentHandle",
  "mdxToJsFast",
  "parseEsm",
  "parseExpression",
  "parseToHtml",
  "renderHandle",
  "serializeHandle",
  "setNodeData",
  "textContentHandle",
  "walkHandle",
  "walkMdastHandle",
];

/** The addon's exported names, introspected when it can be loaded locally. */
function bindingExportNames(bindingPath: string): string[] {
  try {
    const require = createRequire(import.meta.url);
    const addon = require(bindingPath) as Record<string, unknown>;
    const names = Object.keys(addon).filter((name) => name !== "default");
    if (names.length > 0) return names;
  } catch {
    // Cross-building, or the addon needs a runtime the build host lacks.
  }
  return FALLBACK_EXPORTS;
}

/**
 * A Bun plugin that redirects `satteri`'s `#binding` imports to a static
 * re-export of the addon for `target`.
 */
export function satteriBindingPlugin(options: {
  projectRoot: string;
  target: string;
}): BunPlugin {
  const bindingPath = resolveSatteriBinding(options.projectRoot, options.target);
  const names = bindingExportNames(bindingPath);
  const namespace = "satteri-binding";

  const contents = [
    `import binding from ${JSON.stringify(bindingPath)};`,
    ...names.map(
      (name) => `export const ${name} = binding[${JSON.stringify(name)}];`,
    ),
  ].join("\n");

  return {
    name: "satteri-binding",
    setup(build) {
      // Replace the NAPI-RS loader with a virtual module whose exports are
      // statically known, so ESM consumers link and Bun embeds the `.node`.
      build.onResolve({ filter: /^#binding$/ }, () => ({
        path: "satteri-binding",
        namespace,
      }));
      build.onLoad({ filter: /.*/, namespace }, () => ({
        contents,
        loader: "js",
      }));
    },
  };
}
