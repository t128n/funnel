import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, matrixBoard } from "#lib/server/issues/queries";
import type { MatrixBoard } from "#lib/server/issues/types";
import type { LayoutServerLoad } from "./$types";

/**
 * The 4×4 impact × urgency matrix (SPEC §2): the same filtered stream as the
 * Issues view, projected onto 16 counted cells. Lives on the layout so the grid
 * is shared by `/matrix` and the `/matrix/<owner>/<repo>/<n>` detail route.
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
