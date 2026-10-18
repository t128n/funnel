/**
 * Server-side Markdown rendering for GitHub-sourced and intake-authored prose
 * (SPEC §2.2 "Sanitized Markdown Rendering").
 *
 * Sätteri (a Rust core exposed through NAPI) parses GFM and re-emits raw HTML
 * verbatim, so its output is *not* safe on its own: issue bodies, comments, and
 * anonymous intake submissions are all untrusted. Every rendered document is
 * therefore passed through `sanitize-html` with a GitHub-style allowlist, and
 * only the sanitized HTML string reaches the client (which injects it with
 * Svelte's `{@html}`).
 *
 * Rendering is intentionally server-only and synchronous. The browser build of
 * Sätteri needs a WASI fallback plus cross-origin isolation (which would break
 * GitHub avatars), so the client only ever sees the finished string.
 */
import sanitizeHtml from "sanitize-html";
import { markdownToHtml } from "satteri";

/**
 * Tags GitHub renders from issue Markdown, kept close to its own sanitizer so
 * the cockpit matches what reporters see upstream. Anything not listed is
 * discarded by `sanitize-html`.
 */
const ALLOWED_TAGS = [
  // Block structure.
  "p",
  "br",
  "hr",
  "blockquote",
  "pre",
  "div",
  // Headings.
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // Inline semantics.
  "a",
  "strong",
  "b",
  "em",
  "i",
  "del",
  "s",
  "ins",
  "sup",
  "sub",
  "mark",
  "kbd",
  "samp",
  "abbr",
  "code",
  // Lists (task lists add a disabled checkbox input).
  "ul",
  "ol",
  "li",
  "input",
  // Definitions and disclosure widgets.
  "dl",
  "dt",
  "dd",
  "details",
  "summary",
  // Images and tables.
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
];

/**
 * Attribute allowlist. Class values are additionally constrained by
 * `allowedClasses` below; `on*` handlers and `style` are never listed, so
 * `sanitize-html` strips them.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "title", "rel", "target"],
  img: ["src", "alt", "title", "width", "height", "loading"],
  input: ["type", "checked", "disabled"],
  details: ["open"],
  code: ["class"],
  ul: ["class"],
  li: ["class"],
  th: ["align", "style"],
  td: ["align", "style"],
};

/**
 * GFM column alignment arrives as an inline `style`; permit only `text-align`
 * (and only the four legal values) so tables line up like GitHub's without
 * opening the door to arbitrary CSS.
 */
const ALLOWED_STYLES: sanitizeHtml.IOptions["allowedStyles"] = {
  th: { "text-align": [/^(?:left|center|right|justify)$/] },
  td: { "text-align": [/^(?:left|center|right|justify)$/] },
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedStyles: ALLOWED_STYLES,
  // Sätteri marks task lists with these two classes; code fences carry a
  // `language-*` class for downstream syntax highlighting.
  allowedClasses: {
    code: [/^language-/],
    ul: ["contains-task-list"],
    li: ["task-list-item"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // External links open in a new tab without leaking the referrer/opener.
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" },
    }),
    // Lazy-load images from GitHub attachments.
    img: (tagName, attribs) => ({
      tagName,
      attribs: { loading: "lazy", ...attribs },
    }),
  },
};

/**
 * Render untrusted Markdown to sanitized HTML. Safe to inject with `{@html}`;
 * the original Markdown is kept separately by callers for editing.
 */
export function renderMarkdown(source: string): string {
  const { html } = markdownToHtml(source, {
    features: {
      gfm: true,
      // A leading `---` block in an issue body is content, not frontmatter.
      frontmatter: false,
      // Reparse embedded HTML into real elements so the allowlist can vet it
      // (Sätteri would otherwise re-emit raw HTML verbatim).
      rawHtml: true,
    },
  });
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
