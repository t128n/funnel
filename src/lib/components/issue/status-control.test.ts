/**
 * Status select behaviour after a cancelled close/reopen dialog.
 *
 * The reported defect is a state reconciliation bug: choosing Done (or a
 * status on a closed issue) only opens a dialog, so the issue model — and thus
 * the value Svelte renders — never changes. The browser keeps the user's
 * selection, leaving the header and the select contradicting each other, and
 * re-selecting the same option fires no change event.
 *
 * These tests pin the decision the control makes before any write and the
 * display value the caller must restore when the dialog is cancelled.
 */
import { describe, expect, test } from 'bun:test';
import { displayedStatus, statusSelection } from './status-control';

const inProgress = { state: 'open', status: 'in-progress' } as const;
const closed = { state: 'closed', status: null } as const;

describe('status select', () => {
	test('test_cancelling_close_restores_the_current_status', () => {
		expect(statusSelection('done', inProgress)).toEqual({ kind: 'close' });
		// No write happened, so the control must go back to the model value.
		expect(displayedStatus(inProgress)).toBe('in-progress');
	});

	test('test_cancelling_reopen_leaves_the_closed_issue_on_done', () => {
		expect(statusSelection('in-review', closed)).toEqual({
			kind: 'reopen',
			status: 'in-review',
		});
		expect(displayedStatus(closed)).toBe('done');
	});

	test('test_reselecting_the_dialog_status_after_cancel_is_a_new_change', () => {
		// The restored value differs from the option that opens the dialog, so
		// the next selection fires `change` and reopens the dialog.
		expect(displayedStatus(inProgress)).not.toBe('done');
		expect(displayedStatus(closed)).not.toBe('in-review');
	});

	test('test_an_open_issue_still_writes_a_normal_status_change', () => {
		expect(statusSelection('todo', inProgress)).toEqual({
			kind: 'write',
			status: 'todo',
		});
		expect(statusSelection('', inProgress)).toEqual({ kind: 'ignore' });
	});
});
