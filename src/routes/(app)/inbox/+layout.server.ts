import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, inbox } from "#lib/server/issues/queries";
import type { RenderedInboxEntry } from "#lib/server/issues/types";
import { renderMarkdown } from "#lib/server/markdown/render";
import type { LayoutServerLoad } from "./$types";

/**
 * Inbox feed (SPEC §6, §9.2): pending intake submissions followed by untriaged
 * open issues. Lives on the layout so the queue is shared by `/inbox` and the
 * detail routes (issue inspector and staged submission). The triage form
 * actions stay on the submission detail page — SvelteKit only runs the leaf
 * route's actions.
 */
export const load: LayoutServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));

  // Submission bodies are anonymous, untrusted Markdown; render them to
  // sanitized HTML at the delivery boundary (SPEC §2.2).
  const entries: RenderedInboxEntry[] = inbox(filter).entries.map((entry) =>
    entry.kind === "submission"
      ? {
          kind: "submission",
          submission: {
            ...entry.submission,
            bodyHtml: renderMarkdown(entry.submission.body),
          },
        }
      : entry,
  );
  return { inbox: { entries } };
};
