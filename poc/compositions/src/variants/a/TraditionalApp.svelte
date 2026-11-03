<script>
  import {
    Alert,
    Badge,
    Breadcrumb,
    BreadcrumbItem,
    Button,
    Card,
    CardBody,
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
  import SearchPalette from '../../lib/SearchPalette.svelte';

  export let store;
  export let route;

  let navOpen = false;
  let searchOpen = false;

  $: state = $store;
  $: selected = state.issues.find((issue) => issue.id === route.id);
  $: visible = getVisibleIssues(state.issues, state);
  $: inbox = getInboxIssues(state.issues, state);
  $: groups = groupIssues(visible, state.groupBy);
  $: filters = activeFilterCount(state);

  const statusOptions = STATUSES.map((status) => ({ value: status.key, label: status.key }));
  const priorityOptions = PRIORITIES.map((priority) => ({ value: priority.key, label: priority.label }));
  const assigneeOptions = [
    { value: 'all', label: 'Anyone' },
    ...Object.values(PEOPLE).map((user) => ({ value: user.login, label: user.name })),
    { value: 'unassigned', label: 'Unassigned' }
  ];
  const groupOptions = GROUPINGS.map((group) => ({ value: group.key, label: group.label }));
  const detailAssigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...Object.values(PEOPLE).map((user) => ({ value: user.login, label: user.name }))
  ];
  const milestoneOptions = [
    { value: '', label: 'No milestone' },
    ...MILESTONES.filter(Boolean).map((milestone) => ({ value: milestone, label: milestone }))
  ];

  function openIssue(id) {
    navigate(`/a/issues/${id}`);
  }

  function setFilter(key, event) {
    store.setFilter(key, event.currentTarget.value);
  }

  function setSearch(event) {
    store.setQuery(event.currentTarget.value);
  }

  function update(field, value, label, icon) {
    if (!selected) return;
    store.updateIssue(selected.id, { [field]: value }, {
      actor: 't128n',
      action: label,
      icon
    });
  }

  function changeAssignee(value) {
    update('assignee', value || null, `assigned this to ${value ? person(value).name : 'nobody'}`, 'bi-person');
  }

  function changeStatus(value) {
    update('status', value, `changed the status to ${value}`, 'bi-record-circle');
  }

  function changePriority(value) {
    update('priority', value, `changed the priority to ${priorityMeta(value).label}`, 'bi-flag');
  }

  function changeMilestone(value) {
    update('milestone', value, `set the milestone to ${value || 'No milestone'}`, 'bi-flag');
  }
</script>

<svelte:window on:keydown={(event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchOpen = true;
  }
}} />

<Navbar dark color="dark" expand="lg" class="py-2">
  <NavbarBrand href="#/a/issues" class="fw-semibold mb-0">funnel</NavbarBrand>
  <span class="vr d-none d-lg-block opacity-25 mx-1"></span>

  <NavbarToggler
    class="border-0 text-white"
    aria-label="Toggle navigation"
    aria-expanded={navOpen}
    on:click={() => (navOpen = !navOpen)}
  >
    <i class="bi bi-list fs-4" aria-hidden="true"></i>
  </NavbarToggler>

  <Collapse navbar expand="lg" bind:isOpen={navOpen}>
    <Nav navbar class="me-auto">
      <NavItem><NavLink href="#/a/inbox" active={route.view === 'inbox'} class="px-2" on:click={() => (navOpen = false)}>Inbox</NavLink></NavItem>
      <NavItem><NavLink href="#/a/issues" active={route.view === 'issues' || route.view === 'issue'} class="px-2" on:click={() => (navOpen = false)}>Issues</NavLink></NavItem>
      <NavItem><NavLink href="#/a/board" active={route.view === 'board'} class="px-2" on:click={() => (navOpen = false)}>Board</NavLink></NavItem>
      <NavItem><NavLink href="#/a/matrix" active={route.view === 'matrix'} class="px-2" on:click={() => (navOpen = false)}>Matrix</NavLink></NavItem>
      <NavItem><NavLink href="#/a/plan" active={route.view === 'plan'} class="px-2" on:click={() => (navOpen = false)}>Plan</NavLink></NavItem>
      <NavItem><NavLink href="#/a/timeline" active={route.view === 'timeline'} class="px-2" on:click={() => (navOpen = false)}>Timeline</NavLink></NavItem>
    </Nav>

    <div class="d-flex align-items-center gap-2 flex-wrap py-2 py-lg-0">
      <Dropdown>
        <DropdownToggle color="link" size="sm" caret class="text-white-50 text-decoration-none">
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

      <Button color="link" size="sm" class="text-white-50 text-decoration-none" on:click={() => { searchOpen = true; navOpen = false; }}>
        <i class="bi bi-search me-1" aria-hidden="true"></i>Search
        <span class="ms-1 small border border-secondary-subtle text-white-50 px-1 rounded">Ctrl K</span>
      </Button>

      <Dropdown>
        <DropdownToggle color="link" size="sm" caret class="text-white-50 text-decoration-none">
          <i class="bi bi-person-circle me-1" aria-hidden="true"></i>Torben Haack
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
  <PlaceholderContent title={route.view} variant="a" />
{:else if route.view === 'inbox'}
  <main class="container-xl py-4" data-testid="inbox-view">
    <Breadcrumb class="mb-2">
      <BreadcrumbItem href="#/a/issues">Workspace</BreadcrumbItem>
      <BreadcrumbItem active>Inbox</BreadcrumbItem>
    </Breadcrumb>

    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h3 mb-1">Inbox</h1>
        <p class="text-body-secondary mb-0">
          {inbox.length} untriaged {inbox.length === 1 ? 'issue' : 'issues'} · 0 pending submissions
        </p>
      </div>
      <div style="min-width: 18rem;" class="flex-grow-1 flex-lg-grow-0">
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
      <div class="table-responsive border rounded">
        <Table hover class="align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell">Issue</th>
              <th scope="col" class="small text-body-secondary">Title</th>
              <th scope="col" class="small text-body-secondary d-none d-lg-table-cell">Repository</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell">Source</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell">Submitted</th>
              <th scope="col" class="small text-body-secondary text-end">Triage</th>
            </tr>
          </thead>
          <tbody>
            {#each inbox as issue}
              <tr>
                <td class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell">{issue.id}</td>
                <td>
                  <span class="font-monospace small text-body-secondary d-md-none d-block mb-1">{issue.id}</span>
                  <a class="text-decoration-none" href={`#/a/issues/${issue.id}`}>{issue.title}</a>
                  <div class="small text-body-secondary d-md-none mt-1">{issue.repo} · {issue.source}</div>
                </td>
                <td class="small d-none d-lg-table-cell">{issue.repo}</td>
                <td class="small text-body-secondary d-none d-md-table-cell">{issue.source}</td>
                <td class="small text-body-secondary text-nowrap d-none d-md-table-cell">{issue.openedLabel}</td>
                <td class="text-end text-nowrap">
                  <Button
                    color="primary"
                    size="sm"
                    class="me-1"
                    data-testid={`accept-${issue.id}`}
                    on:click={() => store.triage(issue.id, 'accept')}
                  >Accept</Button>
                  <Button
                    color="outline-secondary"
                    size="sm"
                    data-testid={`decline-${issue.id}`}
                    on:click={() => store.triage(issue.id, 'decline')}
                  >Decline</Button>
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
      <Breadcrumb class="mb-2">
        <BreadcrumbItem href="#/a/issues">Issues</BreadcrumbItem>
        <BreadcrumbItem active>{selected.id}</BreadcrumbItem>
      </Breadcrumb>

      <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div class="min-w-0">
          <div class="small text-body-secondary mb-1">
            <i class="bi bi-folder2 me-1" aria-hidden="true"></i>{selected.repo}
            <span class="mx-1">/</span><span class="font-monospace">{selected.id}</span>
          </div>
          <h1 class="h3 mb-2" data-testid="issue-title">{selected.title}</h1>
          <div class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary">
            <span class={`text-${statusMeta(selected.status).tone}`}>
              <i class={`bi ${statusMeta(selected.status).icon} me-1`} aria-hidden="true"></i>{selected.status}
            </span>
            {#each selected.labels as label}
              <Badge color="light" class="border fw-normal text-body-secondary">{label}</Badge>
            {/each}
            <span>opened {selected.openedLabel} by {person(selected.author)?.name}</span>
            <span>updated {selected.updatedLabel}</span>
          </div>
        </div>
        <a
          class="btn btn-sm btn-outline-secondary"
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

      <div class="row g-4 mt-2">
        <div class="col-lg-8">
          <div class="issue-document">
            <IssueBody blocks={selected.description} />
          </div>
          <IssueTimeline issue={selected} onComment={store.addComment} />
        </div>

        <div class="col-lg-4">
          <Card class="mb-3">
            <CardBody>
              <h2 class="h6 mb-3">Properties</h2>

              <label class="form-label small" for="status-select">Status</label>
              <Input
                id="status-select"
                type="select"
                bsSize="sm"
                class="mb-3"
                value={selected.status}
                data-testid="status-control"
                on:change={(event) => changeStatus(event.currentTarget.value)}
              >
                {#each statusOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </Input>

              <label class="form-label small" for="priority-select">Priority</label>
              <Input
                id="priority-select"
                type="select"
                bsSize="sm"
                class="mb-3"
                value={selected.priority}
                data-testid="priority-control"
                on:change={(event) => changePriority(event.currentTarget.value)}
              >
                {#each priorityOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </Input>

              <label class="form-label small" for="assignee-select">Assignee</label>
              <Input
                id="assignee-select"
                type="select"
                bsSize="sm"
                class="mb-3"
                value={selected.assignee || ''}
                data-testid="assignee-control"
                on:change={(event) => changeAssignee(event.currentTarget.value)}
              >
                {#each detailAssigneeOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </Input>

              <label class="form-label small" for="milestone-select">Milestone</label>
              <Input
                id="milestone-select"
                type="select"
                bsSize="sm"
                class="mb-0"
                value={selected.milestone || ''}
                data-testid="milestone-control"
                on:change={(event) => changeMilestone(event.currentTarget.value)}
              >
                {#each milestoneOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </Input>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 class="h6 mb-3">Details</h2>
              <dl class="row small mb-0">
                <dt class="col-5 fw-normal text-body-secondary">Repository</dt>
                <dd class="col-7 mb-2">{selected.repo}</dd>
                <dt class="col-5 fw-normal text-body-secondary">Epic</dt>
                <dd class="col-7 mb-2">{selected.epic}</dd>
                <dt class="col-5 fw-normal text-body-secondary">Size</dt>
                <dd class="col-7 mb-2">{selected.size}</dd>
                <dt class="col-5 fw-normal text-body-secondary">Labels</dt>
                <dd class="col-7 mb-2">
                  {#each selected.labels as label}
                    <Badge color="light" class="border fw-normal text-body-secondary me-1">{label}</Badge>
                  {/each}
                </dd>
                <dt class="col-5 fw-normal text-body-secondary">Opened</dt>
                <dd class="col-7 mb-2">{selected.openedLabel} by {person(selected.author)?.name}</dd>
                <dt class="col-5 fw-normal text-body-secondary">Updated</dt>
                <dd class="col-7 mb-0">{selected.updatedLabel}</dd>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    {:else}
      <Alert color="light" class="border">
        This issue does not exist. <a href="#/a/issues">Return to Issues</a>.
      </Alert>
    {/if}
  </main>
{:else}
  <main class="container-xl py-4" data-testid="issues-view">
    <Breadcrumb class="mb-2">
      <BreadcrumbItem href="#/a/issues">Workspace</BreadcrumbItem>
      <BreadcrumbItem active>Issues</BreadcrumbItem>
    </Breadcrumb>

    <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
      <div>
        <h1 class="h3 mb-1">Issues <span class="fs-6 fw-normal text-body-secondary">{visible.length}</span></h1>
        <p class="text-body-secondary mb-0">Every open issue in the current scope, grouped for scanning.</p>
      </div>
      {#if filters || state.query}
        <Button color="link" size="sm" class="text-decoration-none p-0" on:click={() => store.clearFilters()}>
          Clear {filters + (state.query ? 1 : 0)} active {filters + (state.query ? 1 : 0) === 1 ? 'filter' : 'filters'}
        </Button>
      {/if}
    </div>

    <div class="row g-2 align-items-center mb-3">
      <div class="col-12 col-lg-4">
        <InputGroup size="sm">
          <InputGroupText class="bg-body"><i class="bi bi-search" aria-hidden="true"></i></InputGroupText>
          <Input
            type="search"
            value={state.query}
            on:input={setSearch}
            placeholder="Search title, body, or issue ID"
            aria-label="Search issues"
            data-testid="issue-search"
          />
        </InputGroup>
      </div>

      <div class="col-6 col-lg-2">
        <Input
          type="select"
          bsSize="sm"
          value={state.filters.status}
          on:change={(event) => setFilter('status', event)}
          aria-label="Filter by status"
          data-testid="status-filter"
        >
          <option value={ALL}>All statuses</option>
          {#each STATUSES as status}
            <option value={status.key}>{status.key}</option>
          {/each}
        </Input>
      </div>

      <div class="col-6 col-lg-2">
        <Input
          type="select"
          bsSize="sm"
          value={state.filters.priority}
          on:change={(event) => setFilter('priority', event)}
          aria-label="Filter by priority"
        >
          <option value={ALL}>All priorities</option>
          {#each PRIORITIES as priority}
            <option value={priority.key}>{priority.label}</option>
          {/each}
        </Input>
      </div>

      <div class="col-6 col-lg-2">
        <Input
          type="select"
          bsSize="sm"
          value={state.filters.assignee}
          on:change={(event) => setFilter('assignee', event)}
          aria-label="Filter by assignee"
        >
          {#each assigneeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </Input>
      </div>

      <div class="col-6 col-lg-2">
        <Input
          type="select"
          bsSize="sm"
          value={state.groupBy}
          on:change={(event) => store.setGroupBy(event.currentTarget.value)}
          aria-label="Group issues by"
          data-testid="group-control"
        >
          {#each groupOptions as option}
            <option value={option.value}>Group: {option.label}</option>
          {/each}
        </Input>
      </div>
    </div>

    {#if visible.length}
      <div class="table-responsive border rounded">
        <Table hover class="align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 7rem;">Issue</th>
              <th scope="col" class="small text-body-secondary">Title</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 8rem;">Status</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 7rem;">Priority</th>
              <th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 10rem;">Assignee</th>
              <th scope="col" class="small text-body-secondary text-end d-none d-lg-table-cell" style="width: 8rem;">Updated</th>
            </tr>
          </thead>
          {#each groups as group}
            <tbody>
              <tr class="table-light">
                <th colspan="6" class="small fw-semibold text-body-secondary py-2">
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
                    <div class="d-flex flex-wrap align-items-center gap-2">
                      <span class="text-primary">{issue.title}</span>
                      {#each issue.labels as label}
                        <Badge color="light" class="border fw-normal text-body-secondary">{label}</Badge>
                      {/each}
                    </div>
                    <div class="small text-body-secondary d-md-none mt-1">
                      <span class="font-monospace">{issue.id}</span><span class="mx-1">·</span>
                      <span class={`text-${statusMeta(issue.status).tone}`}>
                        <i class={`bi ${statusMeta(issue.status).icon} me-1`} aria-hidden="true"></i>{issue.status}
                      </span>
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
                  <td class="small d-none d-md-table-cell">{person(issue.assignee)?.name || 'Unassigned'}</td>
                  <td class="small text-body-secondary text-end text-nowrap d-none d-lg-table-cell">{issue.updatedLabel}</td>
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
        <Button color="outline-secondary" size="sm" on:click={() => store.clearFilters()}>Clear filters</Button>
      </div>
    {/if}
  </main>
{/if}
