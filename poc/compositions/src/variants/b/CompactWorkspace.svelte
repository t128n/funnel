<script>
  import {
    Alert,
    Badge,
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Input,
    InputGroup,
    InputGroupText,
    Nav,
    NavItem,
    NavLink,
    Offcanvas
  } from 'sveltestrap';
  import {
    ALL,
    activeFilterCount,
    getInboxIssues,
    getVisibleIssues,
    groupIssues,
    navigate,
    person,
    priorityMeta,
    statusMeta
  } from '../../lib/issueModel.js';
  import { GROUPINGS, MILESTONES, PEOPLE, PRIORITIES, REPOS, STATUSES } from '../../lib/fixtures.js';
  import IssueBody from '../../lib/IssueBody.svelte';
  import IssueTimeline from '../../lib/IssueTimeline.svelte';
  import PlaceholderContent from '../../lib/PlaceholderContent.svelte';
  import PropertyDropdown from '../../lib/PropertyDropdown.svelte';
  import SearchPalette from '../../lib/SearchPalette.svelte';

  export let store;
  export let route;

  let navOpen = false;
  let searchOpen = false;
  let inboxSelectedId = null;
  let inboxDetailOpen = false;
  let showDetail = false;

  $: state = $store;
  $: visible = getVisibleIssues(state.issues, state);
  $: groups = groupIssues(visible, state.groupBy);
  $: inbox = getInboxIssues(state.issues, state);
  $: if (!inbox.find((issue) => issue.id === inboxSelectedId)) {
    inboxSelectedId = inbox[0]?.id || null;
  }
  $: if (!inbox.length) {
    inboxDetailOpen = false;
  }
  $: if (route.view !== 'inbox') {
    inboxDetailOpen = false;
  }
  $: inboxSelected = inbox.find((issue) => issue.id === inboxSelectedId);
  $: selected =
    state.issues.find((issue) => issue.id === route.id) ||
    state.issues.find((issue) => issue.id === state.selectedId) ||
    visible[0];
  $: showDetail = Boolean(route.id);
  $: filters = activeFilterCount(state);

  const statusOptions = STATUSES.map((status) => ({ value: status.key, label: status.key }));
  const priorityOptions = PRIORITIES.map((priority) => ({ value: priority.key, label: priority.label }));
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...Object.values(PEOPLE).map((user) => ({ value: user.login, label: user.name }))
  ];
  const milestoneOptions = [
    { value: '', label: 'No milestone' },
    ...MILESTONES.filter(Boolean).map((milestone) => ({ value: milestone, label: milestone }))
  ];
  const filterAssigneeOptions = [{ value: ALL, label: 'Anyone' }, ...assigneeOptions.slice(1), { value: 'unassigned', label: 'Unassigned' }];
  const groupOptions = GROUPINGS.map((group) => ({ value: group.key, label: group.label }));

  function closeNav() {
    navOpen = false;
  }

  function openIssue(id) {
    store.select(id);
    navigate(`/b/issues/${id}`);
  }

  function backToList() {
    navigate('/b/issues');
  }

  function update(field, value, label, icon) {
    if (!selected) return;
    store.updateIssue(selected.id, { [field]: value }, {
      actor: 't128n',
      action: label,
      icon
    });
  }

  function changeStatus(value) {
    update('status', value, `changed the status to ${value}`, 'bi-record-circle');
  }

  function changePriority(value) {
    update('priority', value, `changed the priority to ${priorityMeta(value).label}`, 'bi-flag');
  }

  function changeAssignee(value) {
    update('assignee', value || null, `assigned this to ${value ? person(value).name : 'nobody'}`, 'bi-person');
  }

  function changeMilestone(value) {
    update('milestone', value, `set the milestone to ${value || 'No milestone'}`, 'bi-flag');
  }

  function myIssues() {
    store.setFilter('assignee', 't128n');
    closeNav();
    navigate('/b/issues');
  }
</script>

<svelte:window on:keydown={(event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchOpen = true;
  }
}} />

<div class="split-shell">
  <aside class="app-sidebar border-end bg-body-tertiary d-none d-lg-flex flex-column">
    <div class="px-3 py-3 border-bottom">
      <a class="text-decoration-none fw-semibold text-body" href="#/b/issues">funnel</a>
    </div>

    <Nav vertical class="p-2 flex-grow-1">
      <NavItem>
        <NavLink href="#/b/inbox" active={route.view === 'inbox'} class="d-flex align-items-center gap-2 py-1">
          <i class="bi bi-inbox" aria-hidden="true"></i>
          <span>Inbox</span>
          {#if inbox.length}<span class="badge text-bg-secondary ms-auto">{inbox.length}</span>{/if}
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="#/b/issues" class="d-flex align-items-center gap-2 py-1" on:click={myIssues}>
          <i class="bi bi-person" aria-hidden="true"></i>
          <span>My issues</span>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="#/b/issues" active={route.view === 'issues' || route.view === 'issue'} class="d-flex align-items-center gap-2 py-1">
          <i class="bi bi-collection" aria-hidden="true"></i>
          <span>Issues</span>
          <span class="small text-body-secondary ms-auto">{visible.length}</span>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="#/b/board" active={route.view === 'board'} class="d-flex align-items-center gap-2 py-1">
          <i class="bi bi-kanban" aria-hidden="true"></i>
          <span>Board</span>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="#/b/plan" active={route.view === 'plan'} class="d-flex align-items-center gap-2 py-1">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          <span>Plan</span>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="#/b/timeline" active={route.view === 'timeline'} class="d-flex align-items-center gap-2 py-1">
          <i class="bi bi-bar-chart-steps" aria-hidden="true"></i>
          <span>Timeline</span>
        </NavLink>
      </NavItem>
    </Nav>

    <div class="border-top p-2">
      <Nav vertical>
        <NavItem>
          <NavLink href="#/b/settings" class="d-flex align-items-center gap-2 py-1">
            <i class="bi bi-gear" aria-hidden="true"></i><span>Settings</span>
          </NavLink>
        </NavItem>
      </Nav>
      <Dropdown>
        <DropdownToggle color="link" size="sm" class="d-flex align-items-center gap-2 px-2 pt-2 text-decoration-none text-body-secondary">
          <i class="bi bi-person-circle" aria-hidden="true"></i>
          <span>Torben Haack</span>
        </DropdownToggle>
        <DropdownMenu>
          <h6 class="dropdown-header">t12n</h6>
          <DropdownItem>Profile</DropdownItem>
          <DropdownItem>Preferences</DropdownItem>
          <DropdownItem divider />
          <DropdownItem>Sign out</DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  </aside>

  <div class="split-main">
    <header class="d-flex align-items-center gap-2 border-bottom px-3 py-2">
      <Button color="light" size="sm" class="d-lg-none" aria-label="Open navigation" on:click={() => (navOpen = true)}>
        <i class="bi bi-list" aria-hidden="true"></i>
      </Button>
      <a class="d-lg-none text-decoration-none fw-semibold text-body" href="#/b/issues">funnel</a>

      <Dropdown>
        <DropdownToggle color="link" size="sm" caret class="text-decoration-none text-body-secondary">
          <i class="bi bi-folder2 me-1" aria-hidden="true"></i>
          {state.filters.repo === ALL ? 'All repositories' : state.filters.repo}
        </DropdownToggle>
        <DropdownMenu>
          <h6 class="dropdown-header">Repository scope</h6>
          <DropdownItem active={state.filters.repo === ALL} on:click={() => store.setFilter('repo', ALL)}>
            All repositories
          </DropdownItem>
          {#each REPOS as repo}
            <DropdownItem active={state.filters.repo === repo.key} on:click={() => store.setFilter('repo', repo.key)}>
              {repo.name}
            </DropdownItem>
          {/each}
        </DropdownMenu>
      </Dropdown>

      <div class="ms-auto d-flex align-items-center gap-2">
        <Button color="light" size="sm" on:click={() => (searchOpen = true)}>
          <i class="bi bi-search me-1" aria-hidden="true"></i><span class="d-none d-sm-inline">Search</span>
        </Button>
      </div>
    </header>

    <SearchPalette
      issues={state.issues}
      open={searchOpen}
      onClose={() => (searchOpen = false)}
      onSelect={(id) => openIssue(id)}
    />

    {#if route.view === 'placeholder'}
      <div class="split-detail">
        <PlaceholderContent title={route.view} variant="b" />
      </div>
    {:else if route.view === 'inbox'}
      <div class="split-workspace" class:detail-open={inboxDetailOpen} data-testid="inbox-view">
        <section class="split-list" aria-labelledby="inbox-heading">
          <div class="px-3 py-3 border-bottom">
            <div class="d-flex align-items-baseline justify-content-between">
              <h1 class="h5 mb-0" id="inbox-heading">Inbox</h1>
              <span class="small text-body-secondary">{inbox.length}</span>
            </div>
            <p class="small text-body-secondary mb-2">{inbox.length} untriaged · 0 submissions</p>
            <InputGroup size="sm">
              <InputGroupText class="bg-body"><i class="bi bi-search" aria-hidden="true"></i></InputGroupText>
              <Input
                type="search"
                value={state.inboxQuery}
                on:input={(event) => store.setInboxQuery(event.currentTarget.value)}
                placeholder="Search inbox"
                aria-label="Search inbox"
              />
            </InputGroup>
          </div>

          <div class="split-list-scroll">
            {#each inbox as issue}
              <button
                type="button"
                class="issue-list-item border-0 border-bottom bg-body w-100 text-start px-3 py-2"
                class:is-selected={issue.id === inboxSelectedId}
                on:click={() => {
                  inboxSelectedId = issue.id;
                  inboxDetailOpen = true;
                }}
              >
                <span class="d-flex align-items-baseline gap-2">
                  <span class="font-monospace small text-body-secondary">{issue.id}</span>
                  <span class="ms-auto small text-body-secondary">{issue.openedLabel}</span>
                </span>
                <span class="d-block mt-1">{issue.title}</span>
                <span class="d-flex flex-wrap gap-2 small text-body-secondary mt-1">
                  <span>{issue.repo}</span><span>·</span><span>{issue.source}</span>
                </span>
              </button>
            {/each}

            {#if !inbox.length}
              <div class="text-center px-3 py-5">
                <i class="bi bi-check-circle fs-4 text-body-secondary d-block mb-2" aria-hidden="true"></i>
                <p class="fw-semibold mb-1">Inbox is clear</p>
                <p class="small text-body-secondary mb-0">New submissions will appear here for triage.</p>
              </div>
            {/if}
          </div>
        </section>

        <section class="split-detail" aria-label="Triage detail">
          <div class="d-md-none border-bottom px-3 py-2 bg-body position-sticky top-0">
            <Button color="link" size="sm" class="text-decoration-none p-0" on:click={() => (inboxDetailOpen = false)}>
              <i class="bi bi-arrow-left me-1" aria-hidden="true"></i>Inbox
            </Button>
          </div>

          {#if inboxSelected}
            <div class="px-3 px-lg-4 py-3">
              <div class="document-measure mx-auto">
                <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-2">
                  <span class="font-monospace">{inboxSelected.id}</span>
                  <span>·</span>
                  <span>{inboxSelected.repo}</span>
                  <span>·</span>
                  <span>{inboxSelected.source}</span>
                  <span class="ms-auto">{inboxSelected.openedLabel}</span>
                </div>
                <h2 class="h4 mb-2">{inboxSelected.title}</h2>
                <p class="small text-body-secondary mb-3">
                  Submitted by {inboxSelected.submitter || 'unknown'}.
                </p>

                <div class="d-flex flex-wrap gap-2 mb-3 pb-3 border-bottom">
                  <Button color="primary" size="sm" data-testid={`accept-${inboxSelected.id}`} on:click={() => store.triage(inboxSelected.id, 'accept')}>
                    Accept
                  </Button>
                  <Button color="outline-secondary" size="sm" data-testid={`decline-${inboxSelected.id}`} on:click={() => store.triage(inboxSelected.id, 'decline')}>
                    Decline
                  </Button>
                  <PropertyDropdown
                    label="Assignee"
                    icon="bi-person"
                    value={inboxSelected.assignee || ''}
                    options={assigneeOptions}
                    onSelect={(value) => store.updateIssue(inboxSelected.id, { assignee: value || null }, {
                      actor: 't128n',
                      action: `assigned this to ${value ? person(value).name : 'nobody'}`,
                      icon: 'bi-person'
                    })}
                    compact
                    testid="assignee-control"
                  />
                </div>

                <IssueBody blocks={inboxSelected.description} />
                <IssueTimeline issue={inboxSelected} onComment={store.addComment} compact />
              </div>
            </div>
          {:else}
            <div class="text-center text-body-secondary px-3 py-5">
              <i class="bi bi-inbox fs-4 d-block mb-2" aria-hidden="true"></i>
              <p class="fw-semibold text-body mb-1">Nothing selected</p>
              <p class="small mb-0">Select a submission to review it.</p>
            </div>
          {/if}
        </section>
      </div>
    {:else}
      <div class="split-workspace" class:detail-open={showDetail} data-testid="issues-view">
        <section class="split-list" aria-labelledby="issues-heading">
          <div class="px-3 py-3 border-bottom">
            <div class="d-flex align-items-baseline justify-content-between">
              <h1 class="h5 mb-0" id="issues-heading">Issues</h1>
              <span class="small text-body-secondary">{visible.length}</span>
            </div>
            <p class="small text-body-secondary mb-2">Dense list, document on the right.</p>

            <div class="d-flex gap-1">
              <InputGroup size="sm" class="flex-grow-1">
                <InputGroupText class="bg-body"><i class="bi bi-search" aria-hidden="true"></i></InputGroupText>
                <Input
                  type="search"
                  value={state.query}
                  on:input={(event) => store.setQuery(event.currentTarget.value)}
                  placeholder="Search issues"
                  aria-label="Search issues"
                  data-testid="issue-search"
                />
              </InputGroup>

              <Dropdown autoClose="outside">
                <DropdownToggle
                  color={filters ? 'primary' : 'outline-secondary'}
                  size="sm"
                  aria-label="Filter issues"
                  title="Filter issues"
                  data-testid="filter-button"
                >
                  <i class="bi bi-funnel" aria-hidden="true"></i>
                  {#if filters}<span class="ms-1">{filters}</span>{/if}
                </DropdownToggle>
                <DropdownMenu end class="p-3" style="min-width: 15rem;">
                  <h6 class="dropdown-header px-0 pt-0">Filter issues</h6>

                  <label class="form-label small" for="b-status-filter">Status</label>
                  <Input
                    id="b-status-filter"
                    type="select"
                    bsSize="sm"
                    class="mb-2"
                    value={state.filters.status}
                    on:change={(event) => store.setFilter('status', event.currentTarget.value)}
                  >
                    <option value={ALL}>All statuses</option>
                    {#each STATUSES as status}<option value={status.key}>{status.key}</option>{/each}
                  </Input>

                  <label class="form-label small" for="b-priority-filter">Priority</label>
                  <Input
                    id="b-priority-filter"
                    type="select"
                    bsSize="sm"
                    class="mb-2"
                    value={state.filters.priority}
                    on:change={(event) => store.setFilter('priority', event.currentTarget.value)}
                  >
                    <option value={ALL}>All priorities</option>
                    {#each PRIORITIES as priority}<option value={priority.key}>{priority.label}</option>{/each}
                  </Input>

                  <label class="form-label small" for="b-assignee-filter">Assignee</label>
                  <Input
                    id="b-assignee-filter"
                    type="select"
                    bsSize="sm"
                    class="mb-2"
                    value={state.filters.assignee}
                    on:change={(event) => store.setFilter('assignee', event.currentTarget.value)}
                  >
                    {#each filterAssigneeOptions as option}<option value={option.value}>{option.label}</option>{/each}
                  </Input>

                  <label class="form-label small" for="b-milestone-filter">Milestone</label>
                  <Input
                    id="b-milestone-filter"
                    type="select"
                    bsSize="sm"
                    class="mb-2"
                    value={state.filters.milestone}
                    on:change={(event) => store.setFilter('milestone', event.currentTarget.value)}
                  >
                    <option value={ALL}>Any milestone</option>
                    {#each MILESTONES.filter(Boolean) as milestone}<option value={milestone}>{milestone}</option>{/each}
                    <option value="">No milestone</option>
                  </Input>

                  <Button color="link" size="sm" class="px-0 text-decoration-none" on:click={() => store.clearFilters()}>
                    Clear filters
                  </Button>
                </DropdownMenu>
              </Dropdown>

              <Dropdown>
                <DropdownToggle color="outline-secondary" size="sm" aria-label="Group issues" title="Group issues" data-testid="group-control">
                  <i class="bi bi-layers" aria-hidden="true"></i>
                </DropdownToggle>
                <DropdownMenu end>
                  <h6 class="dropdown-header">Group by</h6>
                  {#each groupOptions as option}
                    <DropdownItem active={state.groupBy === option.value} on:click={() => store.setGroupBy(option.value)}>
                      {option.label}
                    </DropdownItem>
                  {/each}
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>

          <div class="split-list-scroll">
            {#each groups as group}
              <div class="d-flex justify-content-between px-3 py-1 bg-body-tertiary border-bottom small fw-semibold text-body-secondary">
                <span>{group.label}</span><span>{group.issues.length}</span>
              </div>
              {#each group.issues as issue}
                <button
                  type="button"
                  class="issue-list-item border-0 border-bottom bg-body w-100 text-start px-3 py-2"
                  class:is-selected={issue.id === selected?.id}
                  aria-current={issue.id === selected?.id ? 'true' : undefined}
                  data-testid={`issue-row-${issue.id}`}
                  on:click={() => openIssue(issue.id)}
                >
                  <span class="d-flex align-items-baseline gap-2">
                    <span class="font-monospace small text-body-secondary">{issue.id}</span>
                    <span class="ms-auto small text-body-secondary text-nowrap">{issue.updatedLabel}</span>
                  </span>
                  <span class="d-block mt-1">{issue.title}</span>
                  <span class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mt-1">
                    <span class={`text-${priorityMeta(issue.priority).tone}`}>{priorityMeta(issue.priority).label}</span>
                    <span>·</span>
                    <span>{issue.repo}</span>
                    <span>·</span>
                    <span>{person(issue.assignee)?.name || 'Unassigned'}</span>
                  </span>
                </button>
              {/each}
            {/each}

            {#if !visible.length}
              <div class="text-center px-3 py-5">
                <i class="bi bi-search fs-4 text-body-secondary d-block mb-2" aria-hidden="true"></i>
                <p class="fw-semibold mb-1">No issues found</p>
                <p class="small text-body-secondary mb-3">Try another search or clear the filters.</p>
                <Button color="outline-secondary" size="sm" on:click={() => store.clearFilters()}>Clear filters</Button>
              </div>
            {/if}
          </div>
        </section>

        <section class="split-detail" aria-label="Issue details" data-testid="issue-detail">
          <div class="d-md-none border-bottom px-3 py-2 bg-body position-sticky top-0">
            <Button color="link" size="sm" class="text-decoration-none p-0" on:click={backToList}>
              <i class="bi bi-arrow-left me-1" aria-hidden="true"></i>Issues
            </Button>
          </div>

          {#if selected}
            <div class="px-3 px-lg-4 py-3 py-lg-4">
              <div class="document-measure mx-auto">
                <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-2">
                  <span><i class="bi bi-folder2 me-1" aria-hidden="true"></i>{selected.repo}</span>
                  <span>·</span>
                  <span class="font-monospace">{selected.id}</span>
                  <span>·</span>
                  <span>{selected.epic}</span>
                  <a
                    class="ms-auto text-decoration-none"
                    href={`https://github.com/t12n/${selected.repo}/issues/${selected.number}`}
                    target="_blank"
                    rel="noopener"
                  >GitHub <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>
                </div>

                <h1 class="h4 mb-2" data-testid="issue-title">{selected.title}</h1>

                <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-2">
                  <PropertyDropdown
                    label="Status"
                    icon={statusMeta(selected.status).icon}
                    value={selected.status}
                    options={statusOptions}
                    onSelect={changeStatus}
                    tone={statusMeta(selected.status).tone}
                    compact
                    testid="status-control"
                  />
                  <span class="text-body-tertiary">·</span>
                  <PropertyDropdown
                    label="Priority"
                    icon="bi-flag"
                    value={selected.priority}
                    options={priorityOptions}
                    onSelect={changePriority}
                    tone={priorityMeta(selected.priority).tone}
                    compact
                    testid="priority-control"
                  />
                  <span class="text-body-tertiary">·</span>
                  <PropertyDropdown
                    label="Assignee"
                    icon="bi-person"
                    value={selected.assignee || ''}
                    options={assigneeOptions}
                    onSelect={changeAssignee}
                    compact
                    testid="assignee-control"
                  />
                  <span class="text-body-tertiary">·</span>
                  <PropertyDropdown
                    label="Milestone"
                    icon="bi-flag"
                    value={selected.milestone || ''}
                    options={milestoneOptions}
                    onSelect={changeMilestone}
                    compact
                    testid="milestone-control"
                  />
                  <span class="ms-auto">updated {selected.updatedLabel}</span>
                </div>

                <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-3 pb-3 border-bottom">
                  <span>{selected.size}</span>
                  <span>·</span>
                  <span>opened {selected.openedLabel} by {person(selected.author)?.name}</span>
                  {#each selected.labels as label}
                    <Badge color="light" class="border fw-normal text-body-secondary">{label}</Badge>
                  {/each}
                </div>

                <IssueBody blocks={selected.description} />
                <IssueTimeline issue={selected} onComment={store.addComment} compact />
              </div>
            </div>
          {:else}
            <div class="text-center text-body-secondary px-3 py-5">
              <i class="bi bi-card-text fs-4 d-block mb-2" aria-hidden="true"></i>
              <p class="fw-semibold text-body mb-1">No issue selected</p>
              <p class="small mb-0">Choose an issue from the list.</p>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<Offcanvas isOpen={navOpen} toggle={closeNav} header="funnel" placement="start">
  <Nav vertical class="gap-1">
    <NavItem><NavLink href="#/b/inbox" active={route.view === 'inbox'} on:click={closeNav}><i class="bi bi-inbox me-2"></i>Inbox</NavLink></NavItem>
    <NavItem><NavLink href="#/b/issues" on:click={myIssues}><i class="bi bi-person me-2"></i>My issues</NavLink></NavItem>
    <NavItem><NavLink href="#/b/issues" active={route.view === 'issues' || route.view === 'issue'} on:click={closeNav}><i class="bi bi-collection me-2"></i>Issues</NavLink></NavItem>
    <NavItem><NavLink href="#/b/board" on:click={closeNav}><i class="bi bi-kanban me-2"></i>Board</NavLink></NavItem>
    <NavItem><NavLink href="#/b/plan" on:click={closeNav}><i class="bi bi-calendar3 me-2"></i>Plan</NavLink></NavItem>
    <NavItem><NavLink href="#/b/timeline" on:click={closeNav}><i class="bi bi-bar-chart-steps me-2"></i>Timeline</NavLink></NavItem>
    <NavItem><NavLink href="#/b/settings" on:click={closeNav}><i class="bi bi-gear me-2"></i>Settings</NavLink></NavItem>
  </Nav>
</Offcanvas>
