/**
 * Reaction vocabulary shared by the mirror, the HTTP layer and the UI.
 *
 * GitHub names reactions by content (`+1`, `laugh`, …) and the HTTP API takes
 * that name for both adding and removing one. The mirror stores the counted
 * summary in this shape, and `forges` uses the same union for its
 * `ReactionContent`, so no translation table is needed at the provider edge.
 */

/** Every reaction Funnel shows, in picker order. */
export const REACTION_CONTENTS = [
  "+1",
  "-1",
  "laugh",
  "confused",
  "heart",
  "hooray",
  "rocket",
  "eyes",
] as const;

export type ReactionContent = (typeof REACTION_CONTENTS)[number];

/** Display metadata for one reaction. */
export const REACTION_META: Record<
  ReactionContent,
  { emoji: string; label: string }
> = {
  "+1": { emoji: "👍", label: "Thumbs up" },
  "-1": { emoji: "👎", label: "Thumbs down" },
  laugh: { emoji: "😄", label: "Laugh" },
  confused: { emoji: "😕", label: "Confused" },
  heart: { emoji: "❤️", label: "Heart" },
  hooray: { emoji: "🎉", label: "Hooray" },
  rocket: { emoji: "🚀", label: "Rocket" },
  eyes: { emoji: "👀", label: "Eyes" },
};

/** Counts per reaction, omitting reactions nobody chose. */
export type ReactionCounts = Partial<Record<ReactionContent, number>>;

/**
 * The reaction summary a comment carries. `counts` is the aggregate GitHub
 * reports; `viewerReacted` is the signed-in Funnel user's own selection,
 * tracked locally so a reload keeps the chips filled.
 */
export interface CommentReactions {
  total: number;
  counts: ReactionCounts;
  viewerReacted: ReactionContent[];
}

/** The empty summary for a comment with no reactions. */
export function emptyReactions(): CommentReactions {
  return { total: 0, counts: {}, viewerReacted: [] };
}

/** Whether a raw value is one of Funnel's reaction names. */
export function isReactionContent(value: unknown): value is ReactionContent {
  return (
    typeof value === "string" &&
    (REACTION_CONTENTS as readonly string[]).includes(value)
  );
}

/** GitHub GraphQL names the same reactions differently. */
const GRAPHQL_CONTENT: Record<string, ReactionContent> = {
  THUMBS_UP: "+1",
  THUMBS_DOWN: "-1",
  LAUGH: "laugh",
  CONFUSED: "confused",
  HEART: "heart",
  HOORAY: "hooray",
  ROCKET: "rocket",
  EYES: "eyes",
};

/** One GraphQL `reactionGroups` entry. */
export interface GraphqlReactionGroup {
  content?: string | null;
  users?: { totalCount?: number | null } | null;
}

/**
 * Turn GraphQL `reactionGroups` into a stored summary. Unknown group names
 * are ignored so a new GitHub reaction never breaks hydration; `totalCount`
 * (when supplied) remains the authoritative total.
 */
export function normalizeGraphqlReactions(
  groups: readonly GraphqlReactionGroup[] | null | undefined,
  totalCount?: number | null,
): CommentReactions {
  const counts: ReactionCounts = {};
  let counted = 0;
  for (const group of groups ?? []) {
    const content = GRAPHQL_CONTENT[group.content ?? ""];
    const count = group.users?.totalCount;
    if (!content || typeof count !== "number" || count <= 0) continue;
    counts[content] = (counts[content] ?? 0) + count;
    counted += count;
  }
  return {
    total:
      typeof totalCount === "number" && totalCount >= 0 ? totalCount : counted,
    counts,
    viewerReacted: [],
  };
}

/**
 * Apply one local reaction toggle. Used both for the optimistic chip and for
 * the persisted per-user summary; counts never drop below zero and a repeated
 * toggle is a no-op.
 */
export function toggleReaction(
  reactions: CommentReactions,
  content: ReactionContent,
  active: boolean,
): CommentReactions {
  const already = reactions.viewerReacted.includes(content);
  if (already === active) return reactions;
  const counts = { ...reactions.counts };
  const current = counts[content] ?? 0;
  if (active) {
    counts[content] = current + 1;
  } else if (current <= 1) {
    delete counts[content];
  } else {
    counts[content] = current - 1;
  }
  return {
    total: Math.max(0, reactions.total + (active ? 1 : -1)),
    counts,
    viewerReacted: active
      ? [...reactions.viewerReacted, content]
      : reactions.viewerReacted.filter((entry) => entry !== content),
  };
}
