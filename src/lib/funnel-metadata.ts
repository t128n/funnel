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
import {
  parseImpact,
  parseUrgency,
  type Impact,
  type Urgency,
} from "./priority";

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

type MetadataScalar = string | boolean | number;
type MetadataSection = Map<string, MetadataScalar>;
type MetadataSections = Map<string, MetadataSection>;

/** Canonical section for scalars written without a parent mapping. */
const TOP_LEVEL = "";

/** Emit a YAML double-quoted scalar (JSON escaping is valid YAML). */
function yamlScalar(value: MetadataScalar): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : '""';
  }
  if (value.length === 0) return '""';
  return JSON.stringify(value);
}

/** Strip the `<!-- funnel_metadata` wrapper from an envelope block. */
function envelopeInner(block: string): string {
  return block.replace(/^<!--\s*funnel_metadata\b/, "").replace(/-->\s*$/, "");
}

function parseScalar(raw: string): MetadataScalar {
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
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** Parse an envelope's nested `section:` mappings, preserving insertion order. */
function parseSections(inner: string): MetadataSections {
  const sections: MetadataSections = new Map();
  let current: MetadataSection | null = null;
  for (const line of inner.split("\n")) {
    const header = /^([A-Za-z_][A-Za-z0-9_-]*):\s*$/.exec(line);
    if (header) {
      current = sections.get(header[1]) ?? new Map();
      sections.set(header[1], current);
      continue;
    }
    const match = /^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (match && current) {
      current.set(match[1], parseScalar(match[2]));
      continue;
    }
    const top = /^([A-Za-z_][A-Za-z0-9_-]*):\s+(.+)$/.exec(line);
    if (top) {
      const fields = sections.get(TOP_LEVEL) ?? new Map();
      fields.set(top[1], parseScalar(top[2]));
      sections.set(TOP_LEVEL, fields);
    }
  }
  return sections;
}

/** Serialize sections back into a single metadata envelope. */
function serializeSections(sections: MetadataSections): string {
  const lines = ["<!-- funnel_metadata"];
  for (const [name, fields] of sections) {
    if (fields.size === 0) continue;
    if (name !== TOP_LEVEL) lines.push(`${name}:`);
    const indent = name === TOP_LEVEL ? "" : "  ";
    for (const [key, value] of fields) {
      lines.push(`${indent}${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("-->");
  return lines.join("\n");
}

/** Read the `blocked:` mapping out of parsed envelope sections. */
function parseBlockedSection(fields: MetadataSection | undefined): BlockState {
  if (fields?.get("is_blocked") !== true) return { isBlocked: false, info: null };
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
  return parseBlockedSection(parseSections(envelopeInner(block)).get("blocked"));
}

/**
 * Rewrite the body's metadata to reflect the blocked state. Passing `null`
 * clears the structured fields but keeps `is_blocked: false` (the unblock
 * comment carries the resolution). A body that never carried Funnel metadata is
 * left untouched when clearing, so manually-labelled issues are not polluted.
 * Sections written by other features (for example `priority`) are preserved.
 */
export function writeBlocked(body: string, info: BlockInfo | null): string {
  const { content, block } = splitFunnelMetadata(body);
  if (!info && block === null) return body;
  const sections = block ? parseSections(envelopeInner(block)) : new Map();
  const fields: MetadataSection = new Map();
  if (info) {
    fields.set("is_blocked", true);
    fields.set("blocker", info.blocker);
    fields.set("needs", info.needs);
    fields.set("trying", info.trying);
    fields.set("recheck", info.recheck);
  } else {
    fields.set("is_blocked", false);
  }
  sections.set("blocked", fields);
  return composeFunnelMetadata(content, serializeSections(sections));
}

/** The raw triage axes stored on an issue; either may be unset. */
export interface PriorityInputs {
  impact: Impact | null;
  urgency: Urgency | null;
}

export type PriorityAxes = PriorityInputs;

/**
 * Read `impact`/`urgency` from the `priority:` section. The older top-level
 * form is accepted too, so hand-edited metadata still round-trips.
 */
export function readPriorityInputs(body: string): PriorityInputs {
  const { block } = splitFunnelMetadata(body);
  if (!block) return { impact: null, urgency: null };
  const sections = parseSections(envelopeInner(block));
  const priority = sections.get("priority");
  const top = sections.get(TOP_LEVEL);
  const pick = (key: string) => priority?.get(key) ?? top?.get(key);
  return {
    impact: parseImpact(pick("impact")),
    urgency: parseUrgency(pick("urgency")),
  };
}

export const readImpactUrgency = readPriorityInputs;
export const readPriorityAxes = readPriorityInputs;

/**
 * Write `impact`/`urgency` without disturbing other metadata sections. Canonical
 * output groups them under `priority:`; an unset axis is omitted, and clearing
 * both removes the section (and the envelope when nothing else remains).
 */
export function writePriorityInputs(
  body: string,
  inputs: PriorityInputs,
): string {
  const impact = parseImpact(inputs.impact);
  const urgency = parseUrgency(inputs.urgency);
  const { content, block } = splitFunnelMetadata(body);
  const sections = block ? parseSections(envelopeInner(block)) : new Map();

  const top = sections.get(TOP_LEVEL);
  if (top) {
    top.delete("impact");
    top.delete("urgency");
    if (top.size === 0) sections.delete(TOP_LEVEL);
  }

  const fields = sections.get("priority") ?? new Map();
  fields.delete("impact");
  fields.delete("urgency");
  if (impact !== null) fields.set("impact", impact);
  if (urgency !== null) fields.set("urgency", urgency);
  if (fields.size === 0) sections.delete("priority");
  else sections.set("priority", fields);

  if (sections.size === 0) return content;
  return composeFunnelMetadata(content, serializeSections(sections));
}

export const writeImpactUrgency = writePriorityInputs;
export const writePriorityAxes = writePriorityInputs;

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
