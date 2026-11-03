import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, matrixBoard } from "#lib/server/issues/queries";
import type { MatrixBoard } from "#lib/server/issues/types";
import type { LayoutServerLoad } from "./$types";

/**
 * The 4×4 impact × urgency matrix (SPEC §2): the same filtered stream as the
 * Issues view, projected onto 16 counted cells. The layout owns the load so
 * `/matrix` is the single page that reads it; legacy `/matrix/<owner>/<repo>/<n>`
 * links redirect to the dedicated issue page.
 *
 * The matrix includes triaged and untriaged issues (status is not a
 * requirement) and defaults to `state=open`, matching the Issues focus.
 */
export const load: LayoutServerLoad = async ({ url, parent }) => {
  const { viewerExternalId } = await parent();
  const filter = parseIssueFilter(
    url.searchParams,
    filterContext(viewerExternalId),
  );
  if (filter.states.length === 0) filter.states = ["open"];
  const matrix: MatrixBoard = matrixBoard(filter);
  return { matrix };
};
