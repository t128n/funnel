import { defaultMatrixCell, parseMatrixCell } from "#lib/matrix";
import { parseIssueFilter } from "#lib/server/issues/filters";
import {
  filterContext,
  matrixBoard,
  matrixCellIssues,
  needsAssessmentIssues,
} from "#lib/server/issues/queries";
import type { MatrixBoard } from "#lib/server/issues/types";
import type { LayoutServerLoad } from "./$types";

/**
 * The impact × urgency matrix over the same filtered stream as the Issues view.
 * Lives on the layout so the grid is shared by `/matrix` and the
 * `/matrix/<owner>/<repo>/<n>` detail route.
 *
 * `?cell=<impact>-<urgency>` carries the selection, so a cell can be linked and
 * survives filter changes. Without one, the highest-priority populated cell is
 * selected. The matrix includes triaged and untriaged issues (status is not a
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
  const position =
    parseMatrixCell(url.searchParams.get("cell")) ??
    defaultMatrixCell(matrix.cells);

  return {
    matrix,
    selection: {
      ...position,
      issues: matrixCellIssues(filter, position.impact, position.urgency),
    },
    assessment: needsAssessmentIssues(filter),
  };
};
