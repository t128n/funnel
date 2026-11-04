import type { ClientFilter } from '#lib/url-filter';

/**
 * The issue index and My Issues share one table and one filter model. Only the
 * heading, description and document title identify which destination the
 * `assignee=me` view represents.
 */
export interface IssuesIdentity {
	myIssues: boolean;
	title: string;
	description: string;
}

export function issuesIdentity(filter: Pick<ClientFilter, 'assignees'>): IssuesIdentity {
	const myIssues = filter.assignees.length === 1 && filter.assignees[0] === 'me';
	return myIssues
		? {
				myIssues,
				title: 'My Issues',
				description: 'Issues assigned to you, grouped for scanning.'
			}
		: {
				myIssues,
				title: 'Issues',
				description: 'Every open issue in the current scope, grouped for scanning.'
			};
}
