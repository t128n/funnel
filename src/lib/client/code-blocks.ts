/**
 * Progressive enhancement for rendered Markdown code blocks.
 *
 * The server emits plain sanitized `pre > code` (token spans only); this action
 * wraps each block in a `.code-block` chrome bar carrying the fence language
 * and a copy-to-clipboard button. It runs on mount and again whenever its
 * parameter changes, so `{@html}` re-renders (SSE refreshes, issue switches)
 * pick up freshly injected blocks.
 *
 * Styling for the wrapper lives in `#lib/styles/markdown.css`.
 */

/** Language for a block: the `language-*` class on the code element, else null. */
function languageOf(pre: HTMLPreElement): string | null {
  const code = pre.querySelector("code");
  if (!code) return null;
  const match = [...code.classList].find((name) => name.startsWith("language-"));
  return match ? match.slice("language-".length) || null : null;
}

function enhance(pre: HTMLPreElement) {
  if (pre.dataset.chromed === "true") return;
  const parent = pre.parentElement;
  if (!parent) return;

  const wrapper = document.createElement("div");
  wrapper.className = "code-block";

  const bar = document.createElement("div");
  bar.className = "code-block-bar";

  const label = document.createElement("span");
  label.className = "code-block-lang";
  label.textContent = languageOf(pre) ?? "code";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "code-block-copy";
  copy.textContent = "Copy";
  copy.addEventListener("click", () => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return;
    void clipboard
      .writeText(pre.textContent ?? "")
      .then(() => {
        copy.textContent = "Copied";
        copy.dataset.copied = "true";
        setTimeout(() => {
          copy.textContent = "Copy";
          delete copy.dataset.copied;
        }, 1500);
      })
      .catch(() => {
        // Clipboard blocked (insecure context, permissions): leave the label.
      });
  });

  bar.append(label, copy);
  parent.insertBefore(wrapper, pre);
  wrapper.append(bar, pre);
  pre.dataset.chromed = "true";
}

/**
 * Svelte action: pass the current rendered HTML string as the parameter so the
 * enhancer re-scans whenever the injected content changes.
 */
export function codeBlocks(node: HTMLElement, _key?: unknown) {
  const apply = () => {
    for (const pre of node.querySelectorAll<HTMLPreElement>("pre")) enhance(pre);
  };

  apply();
  return {
    update: apply,
  };
}
