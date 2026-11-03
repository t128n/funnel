<script>
  import {
    Alert,
    Badge,
    Button,
    Collapse,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Input,
    InputGroup,
    InputGroupText,
    Nav,
    Navbar,
    NavbarBrand,
    NavbarToggler,
    NavItem,
    NavLink,
    Table
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

  $: state = $store;
  $: selected = state.issues.find((issue) => issue.id === route.id);
  $: visible = getVisibleIssues(state.issues, state);
  $: groups = groupIssues(visible, state.groupBy);
  $: inbox = getInboxIssues(state.issues, state);
  $: filters = activeFilterCount(state);

  const statusOptions = STATUSES.map((status) => ({ value: status.key, label: status.key }));
  const priorityOptions = PRIORITIES.map((priority) => ({ value: priority.key, label: priority.label }));
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...Object.values(PEOPLE).map((user) => ({ value: user.login, label: user.name }))
  ];
  const filterAssigneeOptions = [{ value: ALL, label: 'Anyone' }, ...assigneeOptions.slice(1), { value: 'unassigned', label: 'Unassigned' }];
  const milestoneOptions = [
    { value: '', label: 'No milestone' },
    ...MILESTONES.filter(Boolean).map((milestone) => ({ value: milestone, label: milestone }))
  ];
  const groupOptions = GROUPINGS.map((group) => ({ value: group.key, label: group.label }));

  function openIssue(id) {
    navigate(`/c/issues/${id}`);
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

  function clearAll() {
    store.clearFilters();
  }
</script>

<svelte:window on:keydown={(event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchOpen = true;
  }
}} />

<Navbar expand="lg" class="bg-body border-bottom py-2">
  <NavbarBrand href="#/c/issues" class="fw-semibold mb-0">funnel</NavbarBrand>
  <NavbarToggler
    class="border-0"
    aria-label="Toggle navigation"
    aria-expanded={navOpen}
    on:click={() => (navOpen = !navOpen)}
  />

  <Collapse navbar expand="lg" bind:isOpen={navOpen}>
    <Nav navbar class="me-auto">
      <NavItem><NavLink href="#/c/inbox" active={route.view === 'inbox'} class="px-2" on:click={() => (navOpen = false)}>Inbox</NavLink></NavItem>
      <NavItem><NavLink href="#/c/issues" active={route.view === 'issues' || route.view === 'issue'} class="px-2" on:click={() => (navOpen = false)}>Issues</NavLink></NavItem>
      <NavItem><NavLink href="#/c/board" active={route.view === 'board'} class="px-2" on:click={() => (navOpen = false)}>Board</NavLink></NavItem>
      <NavItem><NavLink href="#/c/plan" active={route.view === 'plan'} class="px-2" on:click={() => (navOpen = false)}>Plan</NavLink></NavItem>
      <NavItem><NavLink href="#/c/timeline" active={route.view === 'timeline'} class="px-2" on:click={() => (navOpen = false)}>Timeline</NavLink></NavItem>
    </Nav>

    <div class="d-flex align-items-center gap-2 py-2 py-lg-0">
      <Dropdown>
        <DropdownToggle color="link" size="sm" caret class="text-decoration-none text-body-secondary">
          <i class="bi bi-folder2 me-1" aria-hidden="true"></i>
          {state.filters.repo === ALL ? 'All repositories' : state.filters.repo}
        </DropdownToggle>
        <DropdownMenu end>
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

      <Button color="link" size="sm" class="text-decoration-none text-body-secondary" on:click={() => { searchOpen = true; navOpen = false; }}>
        <i class="bi bi-search me-1" aria-hidden="true"></i><span class="d-none d-sm-inline">Search</span>
      </Button>

      <Dropdown>
        <DropdownToggle color="link" size="sm" caret class="text-decoration-none text-body-secondary">
          <i class="bi bi-person-circle me-1" aria-hidden="true"></i><span class="d-none d-md-inline">Torben Haack</span>
        </DropdownToggle>
        <DropdownMenu end>
          <h6 class="dropdown-header">t12n</h6>
          <DropdownItem>Profile</DropdownItem>
          <DropdownItem>Preferences</DropdownItem>
          <DropdownItem divider />
          <DropdownItem>Sign out</DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  </Collapse>
</Navbar>

<SearchPalette
  issues={state.issues}
  open={searchOpen}
  onClose={() => (searchOpen = false)}
  onSelect={(id) => openIssue(id)}
/>

{#if route.view === 'placeholder'}
  <PlaceholderContent title={route.view} variant="c" />
{:else if route.view === 'inbox'}
  <main class="container-fluid px-3 px-lg-4 py-4" data-testid="inbox-view">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <p class="small text-uppercase text-body-secondary mb-1">Triage queue</p>
        <h1 class="h3 mb-1">Inbox <span class="fs-6 fw-normal text-body-secondary">{inbox.length}</span></h1>
        <p class="text-body-secondary mb-0">{inbox.length} untriaged · 0 pending submissions</p>
      </div>
      <div class="flex-grow-1 flex-lg-grow-0" style="min-width: 18rem; max-width: 28rem;">
        <InputGroup size="sm">
          <InputGroupText class="bg-body"><i class="bi bi-search" aria-hidden="true"></i></InputGroupText>
          <Input
            type="search"
            value={state.inboxQuery}
            on:input={(event) => store.setInboxQuery(event.currentTarget.value)}
            placeholder="Search title, body, or issue ID"
            aria-label="Search inbox"
          />
        </InputGroup>
      </div>
    </div>

    {#if inbox.length}
      <div class="d-md-none">
        {#each inbox as issue}
          <div class="border-bottom py-3">
            <div class="d-flex align-items-baseline justify-content-between gap-2">
              <span class="font-monospace small text-body-secondary">{issue.id}</span>
              <span class="small text-body-secondary">{issue.openedLabel}</span>
            </div>
            <a class="d-block text-decoration-none mt-1" href={`#/c/issues/${issue.id}`}>{issue.title}</a>
            <p class="small text-body-secondary mt-1 mb-2">{issue.repo} · {issue.source} · {issue.submitter}</p>
            <div class="d-flex gap-2">
              <Button color="primary" size="sm" data-testid={`accept-mobile-${issue.id}`} on:click={() => store.triage(issue.id, 'accept')}>Accept</Button>
              <Button color="outline-secondary" size="sm" on:click={() => store.triage(issue.id, 'decline')}>Decline</Button>
            </div>
          </div>
        {/each}
      </div>

      <div class="table-responsive border rounded d-none d-md-block">
        <Table hover class="align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="small text-body-secondary">Issue</th>
              <th scope="col" class="small text-body-secondary" style="width: 38%;">Title</th>
              <th scope="col" class="small text-body-secondary">Repository</th>
              <th scope="col" class="small text-body-secondary d-none d-xl-table-cell">Source</th>
              <th scope="col" class="small text-body-secondary d-none d-xl-table-cell">Submitted</th>
              <th scope="col" class="small text-body-secondary text-end">Triage</th>
            </tr>
          </thead>
          <tbody>
            {#each inbox as issue}
              <tr>
                <td class="font-monospace small text-body-secondary text-nowrap">{issue.id}</td>
                <td>
                  <a class="text-decoration-none" href={`#/c/issues/${issue.id}`}>{issue.title}</a>
                  <div class="small text-body-secondary d-xl-none mt-1">{issue.source} · {issue.openedLabel}</div>
                </td>
                <td class="small">{issue.repo}</td>
                <td class="small text-body-secondary d-none d-xl-table-cell">{issue.source}</td>
                <td class="small text-body-secondary text-nowrap d-none d-xl-table-cell">{issue.openedLabel}</td>
                <td class="text-end text-nowrap">
                  <Button color="primary" size="sm" class="me-1" data-testid={`accept-${issue.id}`} on:click={() => store.triage(issue.id, 'accept')}>Accept</Button>
                  <Button color="outline-secondary" size="sm" on:click={() => store.triage(issue.id, 'decline')}>Decline</Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </Table>
      </div>
    {:else}
      <Alert color="success" class="border d-flex align-items-center gap-2">
        <i class="bi bi-check-circle" aria-hidden="true"></i>
        <span>Inbox is clear. Nothing is waiting for triage.</span>
      </Alert>
    {/if}
  </main>
{:else if route.view === 'issue'}
  <main class="container-lg py-4" data-testid="issue-detail">
    {#if selected}
      <div class="reading-measure mx-auto">
        <div class="d-flex align-items-center gap-2 mb-2">
          <a class="text-decoration-none small" href="#/c/issues">
            <i class="bi bi-arrow-left me-1" aria-hidden="true"></i>Issues
          </a>
          <span class="small text-body-secondary">/ {selected.id}</span>
        </div>

        <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div class="min-w-0">
            <div class="small text-body-secondary mb-1">
              <i class="bi bi-folder2 me-1" aria-hidden="true"></i>{selected.repo}
              <span class="mx-1">·</span>{selected.epic}
            </div>
            <h1 class="h3 mb-2" data-testid="issue-title">{selected.title}</h1>
          </div>
          <a
            class="btn btn-sm btn-outline-secondary text-nowrap"
            href={`https://github.com/t12n/${selected.repo}/issues/${selected.number}`}
            target="_blank"
            rel="noopener"
          >
            <i class="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i>Open in GitHub
          </a>
        </div>

        {#if selected.untriaged}
          <Alert color="light" class="border d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
            <span>This submission is still in Inbox and has not been triaged.</span>
            <span class="d-flex gap-2">
              <Button color="primary" size="sm" on:click={() => store.triage(selected.id, 'accept')}>Accept</Button>
              <Button color="outline-secondary" size="sm" on:click={() => store.triage(selected.id, 'decline')}>Decline</Button>
            </span>
          </Alert>
        {/if}

        <div class="d-flex flex-wrap gap-4 small my-3 py-3 border-top border-bottom">
          <div>
            <div class="text-body-secondary mb-1">Status</div>
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
          </div>
          <div>
            <div class="text-body-secondary mb-1">Priority</div>
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
          </div>
          <div>
            <div class="text-body-secondary mb-1">Assignee</div>
            <PropertyDropdown
              label="Assignee"
              icon="bi-person"
              value={selected.assignee || ''}
              options={assigneeOptions}
              onSelect={changeAssignee}
              compact
              testid="assignee-control"
            />
          </div>
          <div>
            <div class="text-body-secondary mb-1">Milestone</div>
            <PropertyDropdown
              label="Milestone"
              icon="bi-flag"
              value={selected.milestone || ''}
              options={milestoneOptions}
              onSelect={changeMilestone}
              compact
              testid="milestone-control"
            />
          </div>
        </div>

        <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-3">
          <span>{selected.size}</span>
          <span>·</span>
          <span>opened {selected.openedLabel} by {person(selected.author)?.name}</span>
          <span>·</span>
          <span>updated {selected.updatedLabel}</span>
          {#each selected.labels as label}
            <Badge color="light" class="border fw-normal text-body-secondary">{label}</Badge>
          {/each}
        </div>

        <div class="issue-document">
          <IssueBody blocks={selected.description} />
        </div>
        <IssueTimeline issue={selected} onComment={store.addComment} />
      </div>
    {:else}
      <Alert color="light" class="border">
        This issue does not exist. <a href="#/c/issues">Return to Issues</a>.
      </Alert>
    {/if}
  </main>
{:else}
  <main class="container-fluid px-3 px-lg-4 py-4" data-testid="issues-view">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
      <div>
        <p class="small text-uppercase text-body-secondary mb-1">Issue index</p>
        <h1 class="h3 mb-1">Issues <span class="fs-6 fw-normal text-body-secondary">{visible.length}</span></h1>
        <p class="text-body-secondary mb-0">A broad, conventional list for scanning titles, state, and ownership.</p>
      </div>
      {#if filters || state.query}
        <Button color="link" size="sm" class="text-decoration-none p-0" on:click={clearAll}>
          Clear {filters + (state.query ? 1 : 0)} active {filters + (state.query ? 1 : 0) === 1 ? 'filter' : 'filters'}
        </Button>
      {/if}
    </div>

    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="flex-grow-1" style="min-width: 18rem; max-width: 34rem;">
        <InputGroup size="sm">
          <InputGroupText class="bg-body"><i class="bi bi-search" aria-hidden="true"></i></InputGroupText>
          <Input
            type="search"
            value={state.query}
            on:input={(event) => store.setQuery(event.currentTarget.value)}
            placeholder="Search title, body, label, or issue ID"
            aria-label="Search issues"
            data-testid="issue-search"
          />
        </InputGroup>
      </div>

      <div style="width: 9.5rem;">
        <Input
          type="select"
          bsSize="sm"
          value={state.filters.status}
          on:change={(event) => store.setFilter('status', event.currentTarget.value)}
          aria-label="Filter by status"
          data-testid="status-filter"
        >
          <option value={ALL}>All statuses</option>
          {#each STATUSES as status}<option value={status.key}>{status.key}</option>{/each}
        </Input>
      </div>

      <div style="width: 9.5rem;">
        <Input
          type="select"
          bsSize="sm"
          value={state.filters.priority}
          on:change={(event) => store.setFilter('priority', event.currentTarget.value)}
          aria-label="Filter by priority"
        >
          <option value={ALL}>All priorities</option>
          {#each PRIORITIES as priority}<option value={priority.key}>{priority.label}</option>{/each}
        </Input>
      </div>

      <div style="width: 11rem;">
        <Input
          type="select"
          bsSize="sm"
          value={state.filters.assignee}
          on:change={(event) => store.setFilter('assignee', event.currentTarget.value)}
          aria-label="Filter by assignee"
        >
          {#each filterAssigneeOptions as option}<option value={option.value}>{option.label}</option>{/each}
        </Input>
      </div>

      <div style="width: 9.5rem;">
        <Input
          type="select"
          bsSize="sm"
          value={state.groupBy}
          on:change={(event) => store.setGroupBy(event.currentTarget.value)}
          aria-label="Group issues by"
          data-testid="group-control"
        >
          {#each groupOptions as option}<option value={option.value}>Group: {option.label}</option>{/each}
        </Input>
      </div>

      <Dropdown autoClose="outside">
        <DropdownToggle color={state.filters.milestone !== ALL ? 'primary' : 'outline-secondary'} size="sm" aria-label="More filters" data-testid="filter-button">
          <i class="bi bi-funnel me-1" aria-hidden="true"></i>More
        </DropdownToggle>
        <DropdownMenu end class="p-3" style="min-width: 16rem;">
          <label class="form-label small" for="c-milestone-filter">Milestone</label>
          <Input
            id="c-milestone-filter"
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
          <Button color="link" size="sm" class="px-0 text-decoration-none" on:click={clearAll}>Clear all filters</Button>
        </DropdownMenu>
      </Dropdown>
    </div>

    {#if visible.length}
      <div class="table-responsive border rounded">
        <Table hover class="align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 6.5rem;">Issue</th>
              <th scope="col" class="small text-body-secondary">Title</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 8rem;">Status</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 7rem;">Priority</th>
              <th scope="col" class="small text-body-secondary d-none d-xl-table-cell" style="width: 4rem;">Size</th>
              <th scope="col" class="small text-body-secondary d-none d-lg-table-cell" style="width: 10rem;">Assignee</th>
              <th scope="col" class="small text-body-secondary d-none d-xl-table-cell" style="width: 15rem;">Milestone</th>
              <th scope="col" class="small text-body-secondary text-end d-none d-md-table-cell" style="width: 7rem;">Updated</th>
            </tr>
          </thead>
          {#each groups as group}
            <tbody>
              <tr class="table-light">
                <th colspan="8" class="small fw-semibold text-body-secondary py-2">
                  {group.label} <span class="fw-normal ms-1">{group.issues.length}</span>
                </th>
              </tr>
              {#each group.issues as issue}
                <tr
                  class="issue-row"
                  role="button"
                  tabindex="0"
                  data-testid={`issue-row-${issue.id}`}
                  on:click={() => openIssue(issue.id)}
                  on:keydown={(event) => {
                    if (event.key === 'Enter') openIssue(issue.id);
                  }}
                >
                  <td class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell">{issue.id}</td>
                  <td>
                    <span class="text-primary">{issue.title}</span>
                    <div class="d-md-none small text-body-secondary mt-1">
                      <span class="font-monospace">{issue.id}</span><span class="mx-1">·</span>
                      <span class={`text-${statusMeta(issue.status).tone}`}>{issue.status}</span>
                      <span class="mx-1">·</span>{priorityMeta(issue.priority).label}
                      <span class="mx-1">·</span>{person(issue.assignee)?.name || 'Unassigned'}
                    </div>
                  </td>
                  <td class="small d-none d-md-table-cell">
                    <span class={`text-${statusMeta(issue.status).tone}`}>
                      <i class={`bi ${statusMeta(issue.status).icon} me-1`} aria-hidden="true"></i>{issue.status}
                    </span>
                  </td>
                  <td class={`small text-${priorityMeta(issue.priority).tone} d-none d-md-table-cell`}>{priorityMeta(issue.priority).label}</td>
                  <td class="small d-none d-xl-table-cell">{issue.size}</td>
                  <td class="small d-none d-lg-table-cell">{person(issue.assignee)?.name || 'Unassigned'}</td>
                  <td class="small text-body-secondary d-none d-xl-table-cell">{issue.milestone || 'No milestone'}</td>
                  <td class="small text-body-secondary text-end text-nowrap d-none d-md-table-cell">{issue.updatedLabel}</td>
                </tr>
              {/each}
            </tbody>
          {/each}
        </Table>
      </div>
      <p class="small text-body-secondary mt-2 mb-0">
        Showing {visible.length} {visible.length === 1 ? 'issue' : 'issues'}
        {#if state.filters.repo !== ALL}in {state.filters.repo}{/if}
      </p>
    {:else}
      <div class="text-center border rounded bg-body-tertiary py-5 px-3">
        <i class="bi bi-search fs-4 text-body-secondary d-block mb-2" aria-hidden="true"></i>
        <p class="fw-semibold mb-1">No issues match this view</p>
        <p class="small text-body-secondary mb-3">Try a different search term, or clear the active filters.</p>
        <Button color="outline-secondary" size="sm" on:click={clearAll}>Clear filters</Button>
      </div>
    {/if}
  </main>
{/if}
