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
  const { viewerExternalId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerExternalId));

  // Submission bodies are anonymous, untrusted Markdown; render them to
  // sanitized HTML at the delivery boundary (SPEC §2.2). The store pages on
  // `items`; `entries` stays as an alias for the detail routes.
  const page = inbox(filter);
  const items: RenderedInboxEntry[] = page.items.map((entry) =>
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
  // All matching submissions arrive on the first page; only issues paginate.
  // Split totals let the page report the queue honestly even when the loaded
  // window still carries rows a triage decision has since removed.
  const submissionTotal = items.filter(
    (entry) => entry.kind === "submission",
  ).length;
  return {
    inbox: {
      items,
      entries: items,
      total: page.total,
      submissionTotal,
      issueTotal: page.total - submissionTotal,
      nextCursor: page.nextCursor,
    },
  };
};
