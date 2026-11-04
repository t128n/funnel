import type { IssueListItem } from '#lib/server/issues/types';

/**
 * The Status select on the Properties card edits two different things: an open
 * issue's status label, and the closed state (Done). The latter always travels
 * through the close/reopen dialog, so the control has to distinguish a write
 * from an action that only opens a dialog.
 */
export type StatusSelection =
	| { kind: 'ignore' }
	| { kind: 'close' }
	| { kind: 'reopen'; status: string }
	| { kind: 'write'; status: string };

type StatusIssue = Pick<IssueListItem, 'state' | 'status'>;

/** The value the select shows for an issue; a closed issue always reads Done. */
export function displayedStatus(issue: StatusIssue): string {
	return issue.state === 'closed' ? 'done' : (issue.status ?? '');
}

/**
 * What selecting `value` should do. Neither a close nor a reopen writes
 * anything up front: both open a dialog that requires a note. The caller must
 * therefore keep the control on the model's value until the dialog commits.
 */
export function statusSelection(value: string, issue: StatusIssue): StatusSelection {
	if (!value) return { kind: 'ignore' };
	if (value === 'done') {
		return issue.state === 'closed' ? { kind: 'ignore' } : { kind: 'close' };
	}
	if (issue.state === 'closed') return { kind: 'reopen', status: value };
	return { kind: 'write', status: value };
}
