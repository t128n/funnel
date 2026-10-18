/**
 * The trailing `<!-- funnel_metadata … -->` block Funnel keeps at the end of an
 * issue body (SPEC §5.1).
 *
 * It is a machine-readable envelope whose payload is YAML. The envelope is a
 * single HTML comment, so the rendered article never shows it (`render.ts` runs
 * sanitize-html with a tag allowlist that excludes comments); only the raw body
 * editor would, which the Inspector strips and re-appends around edits.
 *
 * This module is deliberately dependency-free so it is shared by the client and
 * the server. Scalars are emitted with JSON escaping, which is valid YAML, so an
 * external YAML reader parses the payload even though we do not ship one.
 */

/** A reserved envelope marker; only one such block is kept per body. */
const FUNNEL_METADATA_RE = /<!--\s*funnel_metadata\b[\s\S]*?-->/;

/** Structured blocker fields captured by the Block dialog. */
export interface BlockInfo {
  /** What is blocking the issue. */
  blocker: string;
  /** The concrete step that must happen to unblock it. */
  needs: string;
  /** What is being attempted in the meantime (may be empty). */
  trying: string;
  /** Optional `YYYY-MM-DD` date to re-check the blocker. */
  recheck: string;
}

/** The parsed `blocked:` state for an issue. */
export interface BlockState {
  isBlocked: boolean;
  /** Present only while blocked. */
  info: BlockInfo | null;
}

/** Separate a body into its content and its metadata envelope (if any). */
export function splitFunnelMetadata(body: string): {
  content: string;
  block: string | null;
} {
  const match = FUNNEL_METADATA_RE.exec(body);
  if (!match) return { content: body, block: null };
  const block = match[0];
  const before = body.slice(0, match.index);
  const after = body.slice(match.index + block.length);
  const content = `${before}${after}`.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
  return { content, block };
}

/** Re-attach a metadata envelope to a body's content, at the very end. */
export function composeFunnelMetadata(
  content: string,
  block: string | null,
): string {
  const base = content.replace(/\s+$/, "");
  if (!block) return base;
  return base.length > 0 ? `${base}\n\n${block.trim()}` : block.trim();
}

/** Emit a YAML double-quoted scalar (JSON escaping is valid YAML). */
function yamlScalar(value: string | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value.length === 0) return '""';
  return JSON.stringify(value);
}

/** Build the `blocked:` envelope for a given state. */
function blockedEnvelope(fields: Record<string, string | boolean>): string {
  const lines = ["blocked:"];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`  ${key}: ${yamlScalar(value)}`);
  }
  return ["<!-- funnel_metadata", ...lines, "-->"].join("\n");
}

/** Parse a YAML scalar produced by {@link yamlScalar}. */
function parseScalar(raw: string): string | boolean {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.replace(/^"+|"+$/g, "");
    }
  }
  return trimmed;
}

/** Read the `blocked:` mapping out of an envelope's inner text. */
function parseBlockedBlock(inner: string): BlockState {
  const fields = new Map<string, string | boolean>();
  let inBlocked = false;
  for (const line of inner.split("\n")) {
    if (/^blocked:\s*$/.test(line)) {
      inBlocked = true;
      continue;
    }
    if (!inBlocked) continue;
    const match = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (match) fields.set(match[1], parseScalar(match[2]));
  }

  const isBlocked = fields.get("is_blocked") === true;
  if (!isBlocked) return { isBlocked: false, info: null };
  const str = (key: string) => {
    const value = fields.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    isBlocked: true,
    info: {
      blocker: str("blocker"),
      needs: str("needs"),
      trying: str("trying"),
      recheck: str("recheck"),
    },
  };
}

/** Read the `blocked` state from a full issue body. */
export function readBlocked(body: string): BlockState {
  const { block } = splitFunnelMetadata(body);
  if (!block) return { isBlocked: false, info: null };
  const inner = block
    .replace(/^<!--\s*funnel_metadata\b/, "")
    .replace(/-->\s*$/, "");
  return parseBlockedBlock(inner);
}

/**
 * Rewrite the body's metadata to reflect the blocked state. Passing `null`
 * clears the structured fields but keeps `is_blocked: false` (the unblock
 * comment carries the resolution). A body that never carried Funnel metadata is
 * left untouched when clearing, so manually-labelled issues are not polluted.
 */
export function writeBlocked(body: string, info: BlockInfo | null): string {
  const { content, block } = splitFunnelMetadata(body);
  if (!info && block === null) return body;
  const envelope = info
    ? blockedEnvelope({
        is_blocked: true,
        blocker: info.blocker,
        needs: info.needs,
        trying: info.trying,
        recheck: info.recheck,
      })
    : blockedEnvelope({ is_blocked: false });
  return composeFunnelMetadata(content, envelope);
}

/** The Markdown comment posted when an issue is blocked. */
export function formatBlockComment(info: BlockInfo): string {
  const lines = [
    "### 🚫 Blocked",
    "",
    `- **Blocker:** ${info.blocker}`,
    `- **Needs to unblock:** ${info.needs}`,
  ];
  if (info.trying.trim()) lines.push(`- **Currently trying:** ${info.trying}`);
  if (info.recheck.trim()) lines.push(`- **Re-check:** ${info.recheck}`);
  return lines.join("\n");
}

/** The Markdown comment posted when an issue is unblocked. */
export function formatUnblockComment(note: string): string {
  return `### ✅ Unblocked\n\n${note.trim()}`;
}
