/**
 * Progressive enhancement for rendered Markdown Mermaid diagrams.
 *
 * The server emits plain sanitized `pre > code.language-mermaid` (the diagram
 * source as escaped text); this action mounts a Pele diagram in the block's
 * place. Pele is browser-only and large, so it is imported on demand, and the
 * code block is hidden only once a diagram takes over — without JavaScript (or
 * if the chunk fails to load) the fence remains as a plain code block.
 *
 * Runs on mount and again whenever its parameter changes, so `{@html}`
 * re-renders (SSE refreshes, issue switches) pick up freshly injected blocks.
 */
import type { Mounted } from "pele";

/** Pele's lazy entry, loaded once and shared by every diagram on the page. */
let pele: Promise<typeof import("pele/lazy")> | null = null;

function loadPele(): Promise<typeof import("pele/lazy")> {
  pele ??= import("pele/lazy");
  return pele;
}

/** The diagram source of a `pre > code.language-mermaid`, or null. */
function mermaidSource(pre: HTMLPreElement): string | null {
  const code = pre.querySelector("code");
  if (!code || !code.classList.contains("language-mermaid")) return null;
  return code.textContent ?? "";
}

/**
 * Svelte action: pass the current rendered HTML string as the parameter so the
 * enhancer re-scans whenever the injected content changes.
 */
export function mermaidDiagrams(node: HTMLElement, _key?: unknown) {
  // Bumped on every scan; an async mount that resolves after a re-render (the
  // user switched issues mid-load) sees a stale value and discards itself.
  let generation = 0;
  let mounted: Mounted[] = [];
  let hosts: HTMLElement[] = [];

  function clear() {
    generation += 1;
    for (const diagram of mounted) {
      try {
        diagram.destroy();
      } catch {
        // The `{@html}` re-render already detached the container.
      }
    }
    for (const host of hosts) host.remove();
    mounted = [];
    hosts = [];
  }

  async function apply() {
    clear();
    const run = generation;

    for (const pre of node.querySelectorAll<HTMLPreElement>("pre")) {
      const source = mermaidSource(pre);
      if (source === null || !pre.parentElement) continue;

      const host = document.createElement("div");
      host.className = "pele-diagram";
      pre.parentElement.insertBefore(host, pre);
      hosts.push(host);

      try {
        const { mountAsync } = await loadPele();
        const diagram = await mountAsync(host, source);
        if (run !== generation) {
          diagram.destroy();
          continue;
        }
        mounted.push(diagram);
        // Pele owns the slot now — the diagram, or its own error message.
        pre.hidden = true;
      } catch {
        // The chunk failed to load or the diagram couldn't be drawn; leave the
        // code block visible as the fallback.
        host.remove();
      }
    }
  }

  void apply();

  return {
    update: () => {
      void apply();
    },
    destroy: clear,
  };
}
