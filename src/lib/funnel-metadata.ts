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

/**
 * The canonical delay reasons. Defined here (rather than in the server-only
 * actuals module) so client dialogs and the server share one list; the server
 * module re-exports it.
 */
export const DELAY_REASONS = [
  "dependency",
  "info",
  "review",
  "external",
  "capacity",
  "other",
] as const;

/** A structured reason for a delay record. */
export type DelayReason = (typeof DELAY_REASONS)[number];

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
  /** Why the issue is delayed; older blocks without one read as `other`. */
  reason: DelayReason;
}

/**
 * What `writeBlocked` accepts. `reason` is required by `BlockInfo`, but a
 * rewrite that only touches another field (for example snoozing the re-check
 * date) may omit it; the existing reason is then kept, falling back to `other`.
 */
export type BlockWriteInfo = Omit<BlockInfo, "reason"> & {
  reason?: DelayReason;
};

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
  const rawReason = fields.get("reason");
  const reason: DelayReason =
    typeof rawReason === "string" &&
    (DELAY_REASONS as readonly string[]).includes(rawReason)
      ? (rawReason as DelayReason)
      : "other";
  return {
    isBlocked: true,
    info: {
      blocker: str("blocker"),
      needs: str("needs"),
      trying: str("trying"),
      recheck: str("recheck"),
      reason,
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
 * Sections written by other features are preserved.
 *
 * `reason` is required by `BlockInfo`; when a partial rewrite omits it, the
 * body's existing reason is kept, or `other` when there is none.
 */
export function writeBlocked(body: string, info: BlockWriteInfo | null): string {
  const { content, block } = splitFunnelMetadata(body);
  if (!info && block === null) return body;
  const sections = block ? parseSections(envelopeInner(block)) : new Map();
  const fields: MetadataSection = new Map();
  if (info) {
    const previous = parseBlockedSection(sections.get("blocked")).info;
    fields.set("is_blocked", true);
    fields.set("blocker", info.blocker);
    fields.set("needs", info.needs);
    fields.set("trying", info.trying);
    fields.set("recheck", info.recheck);
    fields.set("reason", info.reason ?? previous?.reason ?? "other");
  } else {
    fields.set("is_blocked", false);
  }
  sections.set("blocked", fields);
  return composeFunnelMetadata(content, serializeSections(sections));
}

/** A `owner/name#number` reference to an epic or a child issue. */
export interface EpicRef {
  owner: string;
  name: string;
  number: number;
}

/** The single accepted shape of an epic reference (SPEC §3). */
const EPIC_REF_RE = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;

/** Parse an `owner/name#number` ref, rejecting malformed and zero refs. */
export function parseEpicRef(ref: string): EpicRef | null {
  const match = EPIC_REF_RE.exec(ref);
  if (!match) return null;
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { owner: match[1], name: match[2], number };
}

/** Render a ref in the canonical `owner/name#number` form. */
export function formatEpicRef(ref: EpicRef): string {
  return `${ref.owner}/${ref.name}#${ref.number}`;
}

/** Case-insensitive identity of a ref (forge names are case-insensitive). */
function epicRefKey(ref: EpicRef): string {
  return `${ref.owner.toLowerCase()}/${ref.name.toLowerCase()}#${ref.number}`;
}

function toEpicRef(value: EpicRef | string | null | undefined): EpicRef | null {
  if (!value) return null;
  if (typeof value === "string") return parseEpicRef(value);
  return parseEpicRef(formatEpicRef(value));
}

/** Split a `children` scalar on commas, dropping blanks. */
function splitEpicChildren(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Read the ordered child refs from the `epic.children` scalar. Malformed refs,
 * zero issue numbers, duplicates and the issue's own ref (`self`) are dropped;
 * the rest keep their written order.
 */
export function readEpicChildren(
  body: string,
  self?: EpicRef | string | null,
): string[] {
  const { block } = splitFunnelMetadata(body);
  if (!block) return [];
  const fields = parseSections(envelopeInner(block)).get("epic");
  const raw = fields?.get("children");
  if (typeof raw !== "string") return [];
  const selfKey = toEpicRef(self);
  const selfId = selfKey ? epicRefKey(selfKey) : null;
  const seen = new Set<string>();
  const children: string[] = [];
  for (const part of splitEpicChildren(raw)) {
    const ref = parseEpicRef(part);
    if (!ref) continue;
    const key = epicRefKey(ref);
    if (key === selfId || seen.has(key)) continue;
    seen.add(key);
    children.push(formatEpicRef(ref));
  }
  return children;
}

/**
 * Rewrite only the `epic:` section with the given children, preserving every
 * other section. Invalid refs and duplicates are dropped; an empty list removes
 * the section (and the envelope when nothing else is left). A body that never
 * carried Funnel metadata and gets no children is returned untouched.
 */
export function writeEpicChildren(body: string, children: string[]): string {
  const { content, block } = splitFunnelMetadata(body);
  const sections: MetadataSections = block
    ? parseSections(envelopeInner(block))
    : new Map();
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const child of children) {
    const ref = parseEpicRef(child.trim());
    if (!ref) continue;
    const key = epicRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(formatEpicRef(ref));
  }
  if (valid.length === 0) {
    if (!sections.delete("epic")) return body;
    if (sections.size === 0) return content;
    return composeFunnelMetadata(content, serializeSections(sections));
  }
  const fields: MetadataSection = new Map([
    ["children", valid.join(",")],
  ]);
  sections.set("epic", fields);
  return composeFunnelMetadata(content, serializeSections(sections));
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
