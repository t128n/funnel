import { writable } from 'svelte/store';
import {
  CURRENT_USER,
  FIXTURES,
  PEOPLE,
  STATUSES,
  PRIORITIES,
  GROUPINGS
} from './fixtures.js';

export const ALL = 'all';

export function statusMeta(key) {
  return STATUSES.find((status) => status.key === key) || STATUSES[0];
}

export function priorityMeta(key) {
  return PRIORITIES.find((priority) => priority.key === key) || PRIORITIES[1];
}

export function person(login) {
  return login ? PEOPLE[login] || { login, name: login, initials: login.slice(0, 2).toUpperCase() } : null;
}

export function personName(login) {
  const user = person(login);
  return user ? user.name : 'Unassigned';
}

export function blocksToText(blocks) {
  if (!blocks) return '';

  return blocks
    .map((block) => {
      if (block.text) return block.text;
      if (block.items) return block.items.join(' ');
      if (block.rows) return block.rows.flat().join(' ');
      return '';
    })
    .join(' ')
    .replace(/[`*_#]/g, ' ');
}

export function issueSearchText(issue) {
  const timeline = (issue.timeline || [])
    .map((item) => {
      if (item.type === 'comment') return blocksToText(item.body);
      return `${item.actor || ''} ${item.action || ''}`;
    })
    .join(' ');

  return [
    issue.id,
    issue.title,
    issue.repo,
    issue.status,
    issue.priority,
    issue.assignee || 'unassigned',
    issue.author,
    issue.milestone,
    issue.labels.join(' '),
    issue.epic,
    issue.source || '',
    issue.submitter || '',
    blocksToText(issue.description),
    timeline
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesQuery(issue, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return issueSearchText(issue).includes(needle);
}

export function matchesFilters(issue, state) {
  const filters = state.filters;

  if (filters.repo !== ALL && issue.repo !== filters.repo) return false;
  if (filters.status !== ALL && issue.status !== filters.status) return false;
  if (filters.priority !== ALL && issue.priority !== filters.priority) return false;
  if (filters.assignee !== ALL) {
    if (filters.assignee === 'unassigned' && issue.assignee) return false;
    if (filters.assignee !== 'unassigned' && issue.assignee !== filters.assignee) return false;
  }
  if (filters.milestone !== ALL) {
    const value = issue.milestone || '';
    if (value !== filters.milestone) return false;
  }

  return true;
}

function sortByUpdated(issues) {
  return [...issues].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getVisibleIssues(issues, state) {
  return sortByUpdated(
    issues.filter(
      (issue) =>
        !issue.untriaged &&
        !issue.declined &&
        matchesFilters(issue, state) &&
        matchesQuery(issue, state.query)
    )
  );
}

export function getInboxIssues(issues, state) {
  return sortByUpdated(
    issues.filter(
      (issue) =>
        issue.untriaged &&
        (state.filters.repo === ALL || issue.repo === state.filters.repo) &&
        matchesQuery(issue, state.inboxQuery)
    )
  );
}

export function groupIssues(issues, groupBy) {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All issues', issues }];
  }

  let groups = [];

  if (groupBy === 'status') {
    groups = STATUSES.map((status) => ({
      key: status.key,
      label: status.key,
      issues: issues.filter((issue) => issue.status === status.key)
    }));
  } else if (groupBy === 'priority') {
    groups = PRIORITIES.map((priority) => ({
      key: priority.key,
      label: priority.label,
      issues: issues.filter((issue) => issue.priority === priority.key)
    }));
  } else {
    groups = Object.keys(PEOPLE).map((login) => ({
      key: login,
      label: PEOPLE[login].name,
      issues: issues.filter((issue) => issue.assignee === login)
    }));
    groups.push({
      key: 'unassigned',
      label: 'Unassigned',
      issues: issues.filter((issue) => !issue.assignee)
    });
  }

  return groups.filter((group) => group.issues.length > 0);
}

export function groupLabel(groupBy) {
  return GROUPINGS.find((group) => group.key === groupBy)?.label || 'Status';
}

export function activeFilterCount(state) {
  return Object.values(state.filters).filter((value) => value !== ALL).length;
}

export function commentCount(issue) {
  return (issue.timeline || []).filter((item) => item.type === 'comment').length;
}

export function initialsFor(login) {
  return person(login)?.initials || '?';
}

function emptyFilters() {
  return {
    repo: ALL,
    status: ALL,
    priority: ALL,
    assignee: ALL,
    milestone: ALL
  };
}

function freshState() {
  return {
    issues: structuredClone(FIXTURES),
    filters: emptyFilters(),
    query: '',
    inboxQuery: '',
    groupBy: 'status',
    selectedId: 'FUN-58'
  };
}

export function createWorkspace() {
  const store = writable(freshState());

  function updateIssue(id, patch, activity) {
    store.update((state) => {
      const issues = state.issues.map((issue) => {
        if (issue.id !== id) return issue;

        const timeline = activity
          ? [
              ...issue.timeline,
              {
                type: 'event',
                actor: activity.actor || CURRENT_USER.login,
                action: activity.action,
                time: 'just now',
                icon: activity.icon || 'bi-pencil'
              }
            ]
          : issue.timeline;

        return {
          ...issue,
          ...patch,
          timeline,
          updatedAt: new Date().toISOString(),
          updatedLabel: 'just now'
        };
      });

      return { ...state, issues };
    });
  }

  return {
    subscribe: store.subscribe,
    setQuery(query) {
      store.update((state) => ({ ...state, query }));
    },
    setInboxQuery(inboxQuery) {
      store.update((state) => ({ ...state, inboxQuery }));
    },
    setFilter(key, value) {
      store.update((state) => ({
        ...state,
        filters: { ...state.filters, [key]: value }
      }));
    },
    clearFilters() {
      store.update((state) => ({ ...state, filters: emptyFilters(), query: '', inboxQuery: '' }));
    },
    setGroupBy(groupBy) {
      store.update((state) => ({ ...state, groupBy }));
    },
    select(id) {
      store.update((state) => ({ ...state, selectedId: id }));
    },
    updateIssue,
    addComment(id, text) {
      const body = text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => ({ type: 'p', text: paragraph }));

      if (!body.length) return;

      store.update((state) => ({
        ...state,
        issues: state.issues.map((issue) => {
          if (issue.id !== id) return issue;

          return {
            ...issue,
            updatedAt: new Date().toISOString(),
            updatedLabel: 'just now',
            timeline: [
              ...issue.timeline,
              {
                type: 'comment',
                author: CURRENT_USER.login,
                time: 'just now',
                body
              }
            ]
          };
        })
      }));
    },
    triage(id, action) {
      if (action === 'accept') {
        updateIssue(id, { untriaged: false, status: 'Backlog' }, {
          actor: CURRENT_USER.login,
          action: 'accepted this submission from intake and moved it to Backlog',
          icon: 'bi-inbox'
        });
      } else if (action === 'decline') {
        updateIssue(id, { untriaged: false, declined: true }, {
          actor: CURRENT_USER.login,
          action: 'declined this submission',
          icon: 'bi-x-circle'
        });
      }
    }
  };
}

export function navigate(path) {
  window.location.hash = `#${path}`;
}

export function issuePath(variant, id) {
  if (variant === 'b') return `/b/issues/${id}`;
  return `/${variant}/issues/${id}`;
}
