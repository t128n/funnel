<svelte:window
  on:keydown={(event) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }}
/>

<script>
  import { tick } from 'svelte';
  import { Button, Collapse, Input, ListGroup, ListGroupItem } from 'sveltestrap';
  import { matchesQuery, statusMeta } from './issueModel.js';

  export let issues = [];
  export let open = false;
  export let onClose = () => {};
  export let onSelect = () => {};

  let query = '';
  let input;

  $: results = query.trim()
    ? issues.filter((issue) => matchesQuery(issue, query)).slice(0, 8)
    : issues
        .filter((issue) => !issue.declined)
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 8);

  $: if (!open) {
    query = '';
  }

  $: if (open) {
    tick().then(() => input?.focus());
  }

  function choose(id) {
    onSelect(id);
    onClose();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }

    if (event.key === 'Enter' && results.length) {
      event.preventDefault();
      choose(results[0].id);
    }
  }
</script>

<Collapse isOpen={open}>
  <div class="border-bottom bg-body-tertiary px-3 px-lg-4 py-3">
    <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
      <h2 class="h6 mb-0">Search issues</h2>
      <Button color="link" size="sm" class="text-decoration-none px-0" on:click={onClose}>Close</Button>
    </div>
    <Input
      bind:this={input}
      type="search"
      bind:value={query}
      placeholder="Search by title, ID, body, label, or person"
      aria-label="Search all issues"
      data-testid="global-search-input"
      on:keydown={handleKeydown}
    />
    <ListGroup flush class="mt-2" style="max-width: 52rem;">
      {#each results as issue}
        <ListGroupItem action tag="button" class="px-0 py-2 text-start" on:click={() => choose(issue.id)}>
          <span class="d-flex align-items-baseline justify-content-between gap-2">
            <span class="small font-monospace text-body-secondary">{issue.id}</span>
            <span class="small text-body-secondary">{issue.repo}</span>
          </span>
          <span class="d-block mt-1">{issue.title}</span>
          <span class="small text-body-secondary">
            <i class={`bi ${statusMeta(issue.status).icon} me-1`} aria-hidden="true"></i>{issue.status}
          </span>
        </ListGroupItem>
      {/each}
    </ListGroup>
    {#if !results.length}
      <p class="small text-body-secondary mt-3 mb-0">No matching issues.</p>
    {/if}
    <p class="small text-body-secondary mt-2 mb-0">
      Across all repositories · <span class="font-monospace">Enter</span> opens the first result · <span class="font-monospace">Esc</span> closes
    </p>
  </div>
</Collapse>
