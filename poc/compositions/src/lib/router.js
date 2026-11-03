const PLACEHOLDER_VIEWS = new Set(['board', 'matrix', 'plan', 'timeline', 'epics', 'milestones', 'settings']);

export function parseRoute(hash = window.location.hash) {
  const clean = String(hash || '').replace(/^#/, '').replace(/\/+$/, '') || '/';
  const parts = clean.split('/').filter(Boolean);

  if (!parts.length) {
    return { name: 'landing', variant: null, view: null, id: null, path: '/' };
  }

  const variant = parts[0];
  if (!['a', 'b', 'c'].includes(variant)) {
    return { name: 'landing', variant: null, view: null, id: null, path: '/' };
  }

  if (parts[1] === 'issues') {
    return {
      name: parts[2] ? 'issue' : 'issues',
      variant,
      view: parts[2] ? 'issue' : 'issues',
      id: parts[2] || null,
      path: clean
    };
  }

  if (parts[1] === 'inbox') {
    return { name: 'inbox', variant, view: 'inbox', id: null, path: clean };
  }

  if (PLACEHOLDER_VIEWS.has(parts[1])) {
    return { name: 'placeholder', variant, view: parts[1], id: null, path: clean };
  }

  return { name: 'issues', variant, view: 'issues', id: null, path: clean };
}

export function routeHash(path) {
  return `#${path}`;
}
