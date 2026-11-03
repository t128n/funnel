/* Funnel Inbox — static mock data and interaction for the Bootstrap PoC.
   No persistence and no backend. State lives for the duration of the page. */

(function () {
  'use strict';

  const issues = [
    {
      id: 'ASY-1',
      number: 1,
      repo: 'assay',
      title: 'Run from Assay: runner agent with SSH and PowerShell execution',
      status: 'Open',
      labels: ['enhancement'],
      assignee: 't128n',
      author: 't128n',
      opened: '3 days ago',
      openedTitle: 'Oct 31, 2026',
      updated: '1 hour ago',
      updatedTitle: 'Nov 3, 2026, 10:15',
      description: `
        <p>Run plans on remote hosts without requiring a checked-out working tree in the control plane. The first iteration targets the two environments we actually operate: Linux hosts over SSH and Windows hosts through PowerShell Remoting.</p>

        <h2>Scope</h2>
        <ul>
          <li>Add a <code>runner</code> agent that registers with the control plane and polls for work.</li>
          <li>Execute each plan step with a bounded timeout and stream stdout and stderr into the execution log.</li>
          <li>Support <code>ssh</code> and <code>winrm</code> transports behind a single runner interface.</li>
          <li>Record exit code, duration, and resolved working directory for every step.</li>
        </ul>

        <h2>Out of scope</h2>
        <p>Container isolation, artifact uploads, and retry policies. Those belong to the execution engine and can be added without changing the runner contract.</p>

        <h2>Open questions</h2>
        <ul>
          <li>Should the agent keep a transport session per host, or reconnect for each run?</li>
          <li>Where do secrets come from: the environment, or a short-lived file mounted into the step?</li>
        </ul>

        <p>The intended entry points, for reference:</p>
        <pre><code>assay runner start --listen :7070 --transport ssh
assay run --plan ./plans/deploy.plan --target prod-web-01</code></pre>
      `,
      comments: [
        {
          author: 't128n',
          initials: 'TH',
          time: '2 days ago',
          body: `<p>Picked up the SSH transport first. PowerShell needs a separate path because WinRM swallows stderr unless we set <code>$ErrorActionPreference = 'Stop'</code> on the remote side.</p>`
        },
        {
          author: 'mkrause',
          initials: 'MK',
          time: '1 day ago',
          body: `<p>Should the transport be a plan-level option or a per-step option? Per step is more flexible, but it makes the plan format noticeably noisier.</p>`
        },
        {
          author: 't128n',
          initials: 'TH',
          time: '1 hour ago',
          body: `<p>Leaning towards per-target with a plan-level default. I will put a draft of the config shape in the repository this week so we can argue about it in a concrete diff.</p>`
        }
      ]
    },
    {
      id: 'ASY-3',
      number: 3,
      repo: 'assay',
      title: 'Migrate the VcsProvider port to forges.link',
      status: 'Open',
      labels: ['enhancement'],
      assignee: null,
      author: 't128n',
      opened: '8 days ago',
      openedTitle: 'Oct 26, 2026',
      updated: '1 week ago',
      updatedTitle: 'Oct 27, 2026, 16:40',
      description: `
        <p>The <code>VcsProvider</code> port duplicates logic that forges.link already owns: repository lookup, branch protection, pull request state, and webhook verification. Move the port onto forges.link and keep Assay responsible only for planning and execution concerns.</p>

        <h2>Migration</h2>
        <ol>
          <li>Replace the hand-written GitHub client with the forges.link <code>Forge</code> interface.</li>
          <li>Move the current adapter tests onto the shared contract suite in forges.link.</li>
          <li>Keep a thin compatibility shim for the old configuration keys for one release.</li>
          <li>Delete the duplicated response types and update the API handlers.</li>
        </ol>

        <h2>Compatibility</h2>
        <p>Existing installations use <code>vcs.provider = "github"</code>. That should continue to work and map internally to the new provider. New configuration may use <code>vcs.forge = "github"</code>; the old key is deprecated but accepted.</p>

        <pre><code>[vcs]
forge = "github"
base_url = "https://github.com"</code></pre>

        <p>The change should be invisible to plan authors. If it is not, we have pulled an implementation detail into the plan format and should fix that first.</p>
      `,
      comments: [
        {
          author: 't128n',
          initials: 'TH',
          time: '5 days ago',
          body: `<p>Started with the read-only methods (repositories, branches, pull request state) so the port can ship without touching write paths. The draft lives in <code>assay/vcs/forge.go</code>.</p>`
        },
        {
          author: 'mkrause',
          initials: 'MK',
          time: '3 days ago',
          body: `<p>Fine. Please keep the error mapping in Assay. forges.link returns typed errors, but our HTTP layer still expects the old problem codes.</p>`
        }
      ]
    },
    {
      id: 'ASY-2',
      number: 2,
      repo: 'assay',
      title: 'Plans in git, executions app-owned and exportable',
      status: 'Open',
      labels: ['enhancement'],
      assignee: null,
      author: 't128n',
      opened: '3 weeks ago',
      openedTitle: 'Oct 13, 2026',
      updated: '1 week ago',
      updatedTitle: 'Oct 27, 2026, 11:05',
      description: `
        <p>Plans are source code and should live in git. Executions are operational records and should stay in the application database, where they can be queried, expired, and exported. This separates review from runtime history without pretending that one storage model fits both.</p>

        <h2>Plan storage</h2>
        <ul>
          <li>Load plan definitions from a configured git ref at execution time.</li>
          <li>Pin the resolved commit SHA on every execution record.</li>
          <li>Reject uncommitted changes in CI; allow them locally with an explicit flag.</li>
        </ul>

        <h2>Execution storage</h2>
        <p>Executions remain app-owned. Each record includes the plan path, resolved commit, target list, start and end timestamps, and step results. The API exposes a stable JSON shape:</p>

        <pre><code>{
  "id": "exe_01HZX4...",
  "plan": "deploy.plan",
  "commit": "3f9c2a1",
  "status": "succeeded",
  "started_at": "2026-10-27T09:14:02Z"
}</code></pre>

        <p>Export is a straight serialization of that shape. Retention is configured per workspace; the default is 30 days.</p>
        <p>Open question: do we need a cross-execution index in git for dashboards, or is the application query sufficient? I think the latter, but it is worth confirming before the schema is frozen.</p>
      `,
      comments: [
        {
          author: 't128n',
          initials: 'TH',
          time: '9 days ago',
          body: `<p>One consequence: a plan can disappear from git while its executions remain. The UI needs to handle that without hiding history.</p>`
        },
        {
          author: 'mkrause',
          initials: 'MK',
          time: '7 days ago',
          body: `<p>The export format should carry a schema version. If step results change later, old exports still need to be readable.</p>`
        }
      ]
    },
    {
      id: 'FUN-53',
      number: 53,
      repo: 'funnel',
      title: 'feat(labels): make the reserved label vocabulary configurable',
      status: 'Open',
      labels: ['enhancement'],
      assignee: null,
      author: 'mkrause',
      opened: '2 weeks ago',
      openedTitle: 'Oct 20, 2026',
      updated: '2 weeks ago',
      updatedTitle: 'Oct 21, 2026, 09:30',
      description: `
        <p>The label vocabulary is currently hard-coded in the label service and enforced in three places: the API, the CLI, and the web form. Make the reserved vocabulary configurable per workspace while keeping a sensible default.</p>

        <h2>Proposal</h2>
        <ul>
          <li>Move the built-in labels into a shipped default configuration file.</li>
          <li>Allow workspaces to add labels and to mark a label as exclusive within a group, for example <code>type/*</code>.</li>
          <li>Keep validation in one place so the CLI and the web form cannot drift.</li>
        </ul>

        <h2>Default vocabulary</h2>
        <pre><code>type: [bug, enhancement, documentation, chore]
priority: [low, normal, high, urgent]
state: [needs-triage, blocked]</code></pre>

        <p>Renaming a reserved label should be possible, but it must not rewrite existing issues' history. Treat it as a display alias, not a migration.</p>
        <p>This also gives us a clean path to workspace-specific labels without shipping a label management UI in the first pass. Configuration in the repository is enough for now.</p>
      `,
      comments: [
        {
          author: 'mkrause',
          initials: 'MK',
          time: '12 days ago',
          body: `<p>Prefer keeping the default labels in the binary as well, so an offline install still validates labels. The workspace config should override, not replace, the defaults.</p>`
        },
        {
          author: 't128n',
          initials: 'TH',
          time: '9 days ago',
          body: `<p>Agreed. <code>label.DefaultVocabulary</code> stays as the fallback and the workspace file is layered on top of it.</p>`
        }
      ]
    }
  ];

  const statuses = ['Open', 'In progress', 'Closed'];

  const statusClasses = {
    'Open': 'status-open',
    'In progress': 'status-progress',
    'Closed': 'status-closed'
  };

  const assignees = [
    { login: 't128n', name: 'torben haack' },
    { login: 'mkrause', name: 'martin krause' }
  ];

  const state = {
    query: '',
    repo: 'all',
    assignment: 'all',
    selectedId: 'ASY-1',
    theme: 'light'
  };

  const els = {
    workspace: document.getElementById('workspace'),
    issueList: document.getElementById('issueList'),
    emptyState: document.getElementById('emptyState'),
    emptyReset: document.getElementById('emptyReset'),
    visibleCount: document.getElementById('visibleCount'),
    inboxSearch: document.getElementById('inboxSearch'),
    filtersButton: document.getElementById('filtersButton'),
    filterCount: document.getElementById('filterCount'),
    clearFilters: document.getElementById('clearFilters'),
    closeFilters: document.getElementById('closeFilters'),
    scopeLabel: document.getElementById('scopeLabel'),
    scopeLabelShort: document.getElementById('scopeLabelShort'),
    scopeButton: document.getElementById('scopeButton'),
    detailPane: document.getElementById('detailPane'),
    detail: document.getElementById('issueDetail'),
    backToList: document.getElementById('backToList'),
    searchModal: document.getElementById('searchModal'),
    globalSearch: document.getElementById('globalSearch'),
    globalResults: document.getElementById('globalResults'),
    globalEmpty: document.getElementById('globalEmpty'),
    themeIcon: document.getElementById('themeIcon'),
    searchShortcut: document.getElementById('searchShortcut')
  };

  const searchModal = new bootstrap.Modal(els.searchModal);

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function htmlToText(html) {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.textContent || '';
  }

  issues.forEach(function (issue) {
    issue.searchText = [
      issue.id,
      issue.title,
      issue.repo,
      issue.assignee || '',
      issue.labels.join(' '),
      htmlToText(issue.description),
      issue.comments.map(function (comment) { return htmlToText(comment.body); }).join(' ')
    ].join(' ').toLowerCase();
  });

  function getVisibleIssues() {
    const query = state.query.trim().toLowerCase();

    return issues.filter(function (issue) {
      if (state.repo !== 'all' && issue.repo !== state.repo) {
        return false;
      }

      if (state.assignment === 'assigned' && !issue.assignee) {
        return false;
      }

      if (state.assignment === 'unassigned' && issue.assignee) {
        return false;
      }

      return !query || issue.searchText.includes(query);
    });
  }

  function renderList(visible) {
    const list = visible || getVisibleIssues();

    els.issueList.innerHTML = list.map(function (issue) {
      const selected = issue.id === state.selectedId;
      const assignment = issue.assignee
        ? '<i class="bi bi-person me-1"></i>' + issue.assignee
        : '<i class="bi bi-person-dash me-1"></i>Unassigned';

      return `
        <button type="button"
                class="list-group-item list-group-item-action issue-item px-3 py-2${selected ? ' is-selected' : ''}"
                data-id="${issue.id}"
                aria-pressed="${selected}">
          <span class="d-flex align-items-baseline justify-content-between gap-2">
            <span class="issue-key">${issue.id}</span>
            <span class="issue-time" title="Updated ${issue.updatedTitle}">${issue.updated}</span>
          </span>
          <span class="issue-title d-block mt-1">${issue.title}</span>
          <span class="issue-meta d-flex flex-wrap align-items-center gap-2 mt-1">
            <span>${issue.repo}</span>
            <span class="meta-dot" aria-hidden="true">&middot;</span>
            <span>${assignment}</span>
            ${issue.labels.map(function (label) {
              return '<span class="label-badge">' + label + '</span>';
            }).join('')}
          </span>
        </button>
      `;
    }).join('');

    els.emptyState.classList.toggle('d-none', list.length > 0);

    els.visibleCount.textContent = list.length === issues.length
      ? String(list.length)
      : list.length + ' of ' + issues.length;

    const activeFilterCount =
      (state.repo !== 'all' ? 1 : 0) +
      (state.assignment !== 'all' ? 1 : 0);

    els.filterCount.textContent = String(activeFilterCount);
    els.filterCount.classList.toggle('d-none', activeFilterCount === 0);
  }

  function assigneeMenu(issue) {
    const people = assignees.map(function (person) {
      const checked = issue.assignee === person.login;
      return `
        <li>
          <button class="dropdown-item d-flex align-items-center gap-2" type="button" data-assign="${person.login}">
            <span>${person.name} <span class="text-body-secondary">(${person.login})</span></span>
            <i class="bi bi-check2 ms-auto${checked ? '' : ' invisible'}"></i>
          </button>
        </li>
      `;
    }).join('');

    return people + `
      <li><hr class="dropdown-divider"></li>
      <li>
        <button class="dropdown-item d-flex align-items-center gap-2" type="button" data-assign="">
          <span>Unassign</span>
          <i class="bi bi-check2 ms-auto${issue.assignee ? ' invisible' : ''}"></i>
        </button>
      </li>
    `;
  }

  function statusMenu(issue) {
    return statuses.map(function (status) {
      const checked = issue.status === status;
      return `
        <li>
          <button class="dropdown-item d-flex align-items-center gap-2" type="button" data-status="${status}">
            <span>${status}</span>
            <i class="bi bi-check2 ms-auto${checked ? '' : ' invisible'}"></i>
          </button>
        </li>
      `;
    }).join('');
  }

  function commentMarkup(comment) {
    return `
      <div class="d-flex gap-3 py-3 border-bottom">
        <span class="avatar avatar-sm">${comment.initials}</span>
        <div class="min-w-0 flex-grow-1">
          <div class="small mb-1">
            <span class="fw-semibold">${comment.author}</span>
            <span class="text-body-secondary">commented ${comment.time}</span>
          </div>
          <div class="comment-body">${comment.body}</div>
        </div>
      </div>
    `;
  }

  function renderDetail() {
    const issue = issues.find(function (item) {
      return item.id === state.selectedId;
    });

    if (!issue) {
      els.detail.innerHTML = `
        <div class="detail-empty text-center text-body-secondary">
          <i class="bi bi-card-text fs-4 d-block mb-2"></i>
          <p class="fw-semibold mb-1">No issue selected</p>
          <p class="small mb-0">Select an issue from the list to view its details.</p>
        </div>
      `;
      return;
    }

    const statusClass = statusClasses[issue.status] || 'status-closed';
    const repoUrl = 'https://github.com/t12n/' + issue.repo + '/issues/' + issue.number;

    els.detail.innerHTML = `
      <div class="d-flex align-items-center justify-content-between gap-3 mb-2">
        <div class="small text-body-secondary min-w-0">
          <i class="bi bi-folder2 me-1"></i><a href="#" class="link-secondary text-decoration-none">${issue.repo}</a>
          <span class="mx-1 text-body-tertiary">/</span>
          <span class="font-monospace">${issue.id}</span>
        </div>
        <a class="btn btn-sm btn-outline-secondary flex-shrink-0" href="${repoUrl}" target="_blank" rel="noopener">
          <i class="bi bi-box-arrow-up-right me-1"></i>Open in GitHub
        </a>
      </div>

      <h1 class="issue-detail-title mb-2">${issue.title}</h1>

      <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary">
        <span class="badge status-badge ${statusClass}">${issue.status}</span>
        ${issue.labels.map(function (label) {
          return '<span class="label-badge">' + label + '</span>';
        }).join('')}
        <span class="meta-dot d-none d-lg-inline" aria-hidden="true">&middot;</span>
        <span>opened <span title="${issue.openedTitle}">${issue.opened}</span> by
          <a href="#" class="link-secondary text-decoration-none">${issue.author}</a></span>
        <span class="meta-dot d-none d-lg-inline" aria-hidden="true">&middot;</span>
        <span>updated <span title="${issue.updatedTitle}">${issue.updated}</span></span>
      </div>

      <div class="detail-actions d-flex flex-wrap align-items-center gap-2 py-3 mt-1 mb-3 border-bottom">
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button"
                  data-bs-toggle="dropdown" aria-expanded="false" aria-label="Change assignee">
            <i class="bi bi-person me-1"></i>${issue.assignee || 'Unassigned'}
          </button>
          <ul class="dropdown-menu">
            <li><h2 class="dropdown-header">Assign to</h2></li>
            ${assigneeMenu(issue)}
          </ul>
        </div>

        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button"
                  data-bs-toggle="dropdown" aria-expanded="false" aria-label="Change status">
            <i class="bi bi-record-circle me-1"></i>${issue.status}
          </button>
          <ul class="dropdown-menu">
            <li><h2 class="dropdown-header">Status</h2></li>
            ${statusMenu(issue)}
          </ul>
        </div>
      </div>

      <div class="issue-body">${issue.description}</div>

      <div class="activity mt-4 pt-4 border-top">
        <div class="d-flex align-items-baseline justify-content-between gap-2 mb-2">
          <h2 class="h6 mb-0">Activity</h2>
          <span class="small text-body-secondary">${issue.comments.length} ${issue.comments.length === 1 ? 'comment' : 'comments'}</span>
        </div>

        <div class="small text-body-secondary py-2">
          <i class="bi bi-tag me-1"></i>
          <span class="fw-semibold text-body">${issue.author}</span> added the label
          ${issue.labels.map(function (label) {
            return '<span class="label-badge">' + label + '</span>';
          }).join(' ')}
          <span class="ms-1">${issue.opened}</span>
        </div>

        ${issue.comments.map(commentMarkup).join('')}

        <form id="commentForm" class="mt-3 pt-3 border-top">
          <label class="form-label small fw-semibold" for="commentInput">Add a comment</label>
          <textarea class="form-control" id="commentInput" rows="3"
                    placeholder="Leave a comment&hellip;"></textarea>
          <div class="d-flex justify-content-end mt-2">
            <button class="btn btn-sm btn-primary" type="submit">Comment</button>
          </div>
        </form>
      </div>
    `;

    els.detail.querySelectorAll('[data-assign]').forEach(function (button) {
      button.addEventListener('click', function () {
        issue.assignee = button.dataset.assign || null;
        renderList();
        renderDetail();
      });
    });

    els.detail.querySelectorAll('[data-status]').forEach(function (button) {
      button.addEventListener('click', function () {
        issue.status = button.dataset.status;
        renderDetail();
      });
    });

    const form = els.detail.querySelector('#commentForm');
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const input = els.detail.querySelector('#commentInput');
      const text = input.value.trim();

      if (!text) {
        input.focus();
        return;
      }

      const safe = escapeHtml(text)
        .replace(/\r?\n\r?\n/g, '</p><p>')
        .replace(/\r?\n/g, '<br>');

      issue.comments.push({
        author: 't128n',
        initials: 'TH',
        time: 'just now',
        body: '<p>' + safe + '</p>'
      });

      issue.updated = 'just now';
      issue.updatedTitle = 'Just now';
      issue.searchText += ' ' + text.toLowerCase();

      renderList();
      renderDetail();
      els.detailPane.scrollTop = els.detailPane.scrollHeight;
    });
  }

  function refresh() {
    const visible = getVisibleIssues();

    if (!visible.some(function (issue) { return issue.id === state.selectedId; })) {
      state.selectedId = visible.length ? visible[0].id : null;
    }

    renderList(visible);
    renderDetail();
  }

  function selectIssue(id, openOnMobile) {
    state.selectedId = id;

    if (openOnMobile || window.matchMedia('(max-width: 767.98px)').matches) {
      els.workspace.classList.add('detail-open');
    }

    renderList();
    renderDetail();
    els.detailPane.scrollTop = 0;
  }

  function syncFilterInputs() {
    document.querySelectorAll('input[name="repoFilter"]').forEach(function (input) {
      input.checked = input.value === state.repo;
    });

    document.querySelectorAll('input[name="assignmentFilter"]').forEach(function (input) {
      input.checked = input.value === state.assignment;
    });
  }

  function updateScopeUI() {
    const label = state.repo === 'all' ? 'All repositories' : state.repo;
    const shortLabel = state.repo === 'all' ? 'All repos' : state.repo;

    els.scopeLabel.textContent = label;
    els.scopeLabelShort.textContent = shortLabel;
    els.scopeButton.setAttribute('aria-label', 'Repository scope: ' + label);

    document.querySelectorAll('[data-scope]').forEach(function (button) {
      const check = button.querySelector('.scope-check');
      if (check) {
        check.classList.toggle('invisible', button.dataset.scope !== state.repo);
      }
      button.setAttribute('aria-pressed', String(button.dataset.scope === state.repo));
    });
  }

  function resetFilters(includeSearch) {
    state.repo = 'all';
    state.assignment = 'all';

    if (includeSearch) {
      state.query = '';
      els.inboxSearch.value = '';
    }

    syncFilterInputs();
    updateScopeUI();
    refresh();
  }

  /* Start with a selected issue so the detail layout is visible immediately. */
  updateScopeUI();
  renderList();
  renderDetail();

  els.issueList.addEventListener('click', function (event) {
    const item = event.target.closest('.issue-item');
    if (item) {
      selectIssue(item.dataset.id);
    }
  });

  els.inboxSearch.addEventListener('input', function () {
    state.query = els.inboxSearch.value;
    refresh();
  });

  els.inboxSearch.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && els.inboxSearch.value) {
      event.preventDefault();
      els.inboxSearch.value = '';
      state.query = '';
      refresh();
    }
  });

  document.querySelectorAll('input[name="repoFilter"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) {
        return;
      }
      state.repo = input.value;
      updateScopeUI();
      refresh();
    });
  });

  document.querySelectorAll('input[name="assignmentFilter"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked) {
        return;
      }
      state.assignment = input.value;
      refresh();
    });
  });

  document.querySelectorAll('[data-scope]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.repo = button.dataset.scope;
      syncFilterInputs();
      updateScopeUI();
      refresh();
    });
  });

  els.clearFilters.addEventListener('click', function () {
    resetFilters(false);
  });

  els.emptyReset.addEventListener('click', function () {
    resetFilters(true);
  });

  els.closeFilters.addEventListener('click', function () {
    bootstrap.Dropdown.getOrCreateInstance(els.filtersButton).hide();
  });

  els.backToList.addEventListener('click', function () {
    els.workspace.classList.remove('detail-open');

    const selected = els.issueList.querySelector('.issue-item.is-selected');
    if (selected) {
      selected.focus({ preventScroll: true });
    }
  });

  /* Global search palette */
  function renderGlobalResults() {
    const query = els.globalSearch.value.trim().toLowerCase();

    const results = issues.filter(function (issue) {
      if (!query) {
        return true;
      }

      return [issue.id, issue.title, issue.repo, issue.assignee || '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    els.globalResults.innerHTML = results.map(function (issue) {
      return `
        <button type="button" class="list-group-item list-group-item-action global-result px-0 py-2" data-open-issue="${issue.id}">
          <span class="d-flex align-items-baseline justify-content-between gap-2">
            <span class="small font-monospace text-body-secondary">${issue.id}</span>
            <span class="small text-body-secondary">${issue.repo}</span>
          </span>
          <span class="d-block mt-1">${issue.title}</span>
        </button>
      `;
    }).join('');

    els.globalEmpty.classList.toggle('d-none', results.length > 0);
  }

  function openIssueFromSearch(id) {
    state.query = '';
    els.inboxSearch.value = '';
    resetFilters(false);
    selectIssue(id, true);
    searchModal.hide();
  }

  els.globalResults.addEventListener('click', function (event) {
    const result = event.target.closest('[data-open-issue]');
    if (result) {
      openIssueFromSearch(result.dataset.openIssue);
    }
  });

  els.globalSearch.addEventListener('input', renderGlobalResults);

  els.globalSearch.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      const first = els.globalResults.querySelector('[data-open-issue]');
      if (first) {
        event.preventDefault();
        openIssueFromSearch(first.dataset.openIssue);
      }
    }
  });

  els.searchModal.addEventListener('shown.bs.modal', function () {
    renderGlobalResults();
    els.globalSearch.focus();
  });

  els.searchModal.addEventListener('hidden.bs.modal', function () {
    els.globalSearch.value = '';
    els.globalResults.innerHTML = '';
    els.globalEmpty.classList.add('d-none');
  });

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchModal.show();
    }
  });

  /* Theme */
  function applyTheme(mode, persist) {
    state.theme = mode;

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = mode === 'dark' || (mode === 'system' && prefersDark);

    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');

    if (persist) {
      try {
        localStorage.setItem('funnel-bootstrap-theme', mode);
      } catch (error) { /* localStorage may be unavailable */ }
    }

    const icons = {
      light: 'bi-sun',
      dark: 'bi-moon',
      system: 'bi-circle-half'
    };

    els.themeIcon.className = 'bi ' + icons[mode];

    document.querySelectorAll('[data-theme]').forEach(function (button) {
      const check = button.querySelector('.theme-check');
      if (check) {
        check.classList.toggle('invisible', button.dataset.theme !== mode);
      }
      button.setAttribute('aria-pressed', String(button.dataset.theme === mode));
    });
  }

  document.querySelectorAll('[data-theme]').forEach(function (button) {
    button.addEventListener('click', function () {
      applyTheme(button.dataset.theme, true);
    });
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (state.theme === 'system') {
      applyTheme('system', false);
    }
  });

  let initialTheme = 'light';
  try {
    initialTheme = localStorage.getItem('funnel-bootstrap-theme') || 'light';
  } catch (error) { /* use the default */ }

  applyTheme(initialTheme, false);

  /* Platform-aware shortcut hint */
  if (/Mac|iPhone|iPad/.test(navigator.platform)) {
    els.searchShortcut.textContent = '\u2318 K';
  }

  /* Sidebar links are placeholders in this prototype. */
  document.querySelectorAll('.sidebar .nav-link').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (link.getAttribute('href') === '#') {
        event.preventDefault();
      }
    });
  });
})();
