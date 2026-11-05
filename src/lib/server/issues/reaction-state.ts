/**
 * Durable per-user comment reaction state.
 *
 * GitHub's API can add or remove a reaction by content, so Funnel never needs
 * to store GitHub reaction ids. What it cannot read from the shared mirror is
 * *who* left which reaction: that is only visible to a request made with the
 * viewer's token. The detail read therefore merges these rows into the comment
 * DTO, giving the signed-in user a filled chip that survives a reload.
 *
 * This is an additive best-effort cache. GitHub remains authoritative for the
 * counts (hydrated into `mirror_comment.reactions`), and a reaction added
 * directly on GitHub is still counted even though Funnel has no local row for
 * it. Deleting a comment or pruning the mirror leaves the row harmlessly in
 * place; the next toggle or re-sync reconciles the visible state.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateCommentReaction } from "#lib/server/db/schema";
import type { ReactionContent } from "#lib/reactions";

/**
 * The viewer's reactions for a page of comments, keyed by forge-native comment
 * id. Returns an empty map when the page is empty.
 */
export function listViewerReactions(
  userId: string,
  repo: string,
  commentExternalIds: readonly string[],
): Map<string, ReactionContent[]> {
  const byComment = new Map<string, ReactionContent[]>();
  if (commentExternalIds.length === 0) return byComment;

  const rows = db
    .select({
      commentExternalId: stateCommentReaction.commentExternalId,
      content: stateCommentReaction.content,
    })
    .from(stateCommentReaction)
    .where(
      and(
        eq(stateCommentReaction.userId, userId),
        // GitHub treats owner and repo names case-insensitively; normalise the
        // key so a route param and the mirror's canonical slug agree.
        eq(stateCommentReaction.repo, repo.toLowerCase()),
        inArray(
          stateCommentReaction.commentExternalId,
          [...commentExternalIds],
        ),
      ),
    )
    .all();

  for (const row of rows) {
    const list = byComment.get(row.commentExternalId) ?? [];
    list.push(row.content as ReactionContent);
    byComment.set(row.commentExternalId, list);
  }
  return byComment;
}

/** Record that the viewer added (`active`) or removed one reaction. */
export function rememberViewerReaction(
  userId: string,
  repo: string,
  commentExternalId: string,
  content: ReactionContent,
  active: boolean,
): void {
  if (active) {
    db.insert(stateCommentReaction)
      .values({
        userId,
        repo: repo.toLowerCase(),
        commentExternalId,
        content,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
    return;
  }
  db.delete(stateCommentReaction)
    .where(
      and(
        eq(stateCommentReaction.userId, userId),
        eq(stateCommentReaction.repo, repo.toLowerCase()),
        eq(stateCommentReaction.commentExternalId, commentExternalId),
        eq(stateCommentReaction.content, content),
      ),
    )
    .run();
}
