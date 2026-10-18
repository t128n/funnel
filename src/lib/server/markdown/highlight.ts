/**
 * Server-side syntax highlighting for fenced code blocks (SPEC §2.2).
 *
 * Sätteri parses GFM and, with `rawHtml`, exposes fenced blocks as real
 * `pre > code` elements. This HAST plugin hooks that tree before it is rendered
 * to HTML and swaps each block's text for the token spans highlight.js emits
 * (via `lowlight`, which speaks HAST directly and runs synchronously — keeping
 * `renderMarkdown` synchronous and testable).
 *
 * The token spans carry the standard `hljs-*` classes; `renderMarkdown`'s
 * `sanitize-html` allowlist permits exactly those, and `markdown.css` maps them
 * onto the theme's `--syntax-*` tokens.
 */
import { defineHastPlugin } from "satteri";
import { common, createLowlight } from "lowlight";
import type { Element } from "hast";

const lowlight = createLowlight(common);

/** The `language-*` value on a code element's `className`, if present. */
function languageOf(properties: Element["properties"]): string | null {
  const raw: unknown = properties?.className;
  const classes: string[] = Array.isArray(raw)
    ? raw.map((value) => String(value))
    : typeof raw === "string"
      ? raw.split(/\s+/)
      : [];
  const match = classes.find((name) => name.startsWith("language-"));
  return match ? match.slice("language-".length) || null : null;
}

/**
 * Highlight every fenced block whose code element is followed by a registered
 * language. Blocks without a language (or with an unknown one) are left as
 * plain text: auto-detection guesses wrong often enough to hurt more than it
 * helps in an issue tracker.
 */
export const highlightCode = defineHastPlugin({
  name: "highlight-code",
  element: {
    filter: ["pre"],
    visit(node, ctx) {
      const code = (node.children ?? []).find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      if (!code) return;

      const language = languageOf(code.properties);
      const source = ctx.textContent(code);
      if (!language || !source || !lowlight.registered(language)) return;

      let highlighted;
      try {
        highlighted = lowlight.highlight(language, source);
      } catch {
        // An exotic language definition can still throw; leave the block plain.
        return;
      }

      ctx.replaceNode(code, {
        type: "element",
        tagName: "code",
        properties: { className: ["hljs", `language-${language}`] },
        children: highlighted.children as Element["children"],
      });
    },
  },
});
