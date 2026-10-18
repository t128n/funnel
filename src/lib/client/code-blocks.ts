/**
 * Progressive enhancement for rendered Markdown code blocks.
 *
 * The server emits plain sanitized `pre > code` (token spans only); this action
 * replaces each block with the registry `CodeBlock` component, highlighted with
 * Shiki and carrying a language header and copy button. It runs on mount and
 * again whenever its parameter changes, so `{@html}` re-renders (SSE refreshes,
 * issue switches) pick up freshly injected blocks.
 *
 * Mermaid fences are left untouched for `#lib/client/mermaid` to render.
 *
 * Without JavaScript the lowlight-highlighted `pre` remains the fallback.
 */
import { mount, unmount } from "svelte";
import MarkdownCodeBlock from "#lib/components/markdown/CodeBlock.svelte";

/** Language for a block: the `language-*` class on the code element, else null. */
function languageOf(pre: HTMLPreElement): string | null {
  const code = pre.querySelector("code");
  if (!code) return null;
  const match = [...code.classList].find((name) => name.startsWith("language-"));
  return match ? match.slice("language-".length) || null : null;
}

/**
 * Svelte action: pass the current rendered HTML string as the parameter so the
 * enhancer re-scans whenever the injected content changes.
 */
export function codeBlocks(node: HTMLElement, _key?: unknown) {
  let instances: ReturnType<typeof mount>[] = [];
  let hosts: HTMLElement[] = [];

  function clear() {
    for (const instance of instances) {
      try {
        unmount(instance);
      } catch {
        // The `{@html}` re-render already detached the mount target.
      }
    }
    for (const host of hosts) host.remove();
    instances = [];
    hosts = [];
  }

  function apply() {
    clear();

    for (const pre of node.querySelectorAll<HTMLPreElement>("pre")) {
      const code = pre.querySelector("code");
      if (!code || !pre.parentElement) continue;
      // Mermaid diagrams get their own enhancer; keep this one off them.
      if (code.classList.contains("language-mermaid")) continue;

      const host = document.createElement("div");
      pre.parentElement.insertBefore(host, pre);
      pre.hidden = true;

      hosts.push(host);
      instances.push(
        mount(MarkdownCodeBlock, {
          target: host,
          props: { code: code.textContent ?? "", language: languageOf(pre) },
        })
      );
    }
  }

  apply();

  return {
    update: apply,
    destroy: clear,
  };
}
