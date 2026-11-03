<script>
  import { onMount } from 'svelte';
  import Landing from './Landing.svelte';
  import { createWorkspace } from './lib/issueModel.js';
  import { parseRoute } from './lib/router.js';
  import CompactWorkspace from './variants/b/CompactWorkspace.svelte';
  import TraditionalApp from './variants/a/TraditionalApp.svelte';
  import ListFirstApp from './variants/c/ListFirstApp.svelte';

  const workspaces = {
    a: createWorkspace(),
    b: createWorkspace(),
    c: createWorkspace()
  };

  let route = parseRoute();
  let previous = null;

  onMount(() => {
    function syncRoute() {
      const next = parseRoute();

      if (previous && previous.variant === next.variant) {
        const workspace = workspaces[next.variant];

        if (next.view === 'inbox' && previous.view !== 'inbox') {
          workspace.setQuery('');
        }

        if (next.view === 'issues' && previous.view === 'inbox') {
          workspace.setQuery('');
          workspace.setInboxQuery('');
        }

        if ((next.view === 'issues' || next.view === 'issue') && previous.view === 'inbox') {
          workspace.setInboxQuery('');
        }
      }

      route = next;
      previous = next;
      window.scrollTo(0, 0);
    }

    window.addEventListener('hashchange', syncRoute);
    syncRoute();

    return () => window.removeEventListener('hashchange', syncRoute);
  });
</script>

{#if !route.variant}
  <Landing />
{:else if route.variant === 'a'}
  <TraditionalApp store={workspaces.a} {route} />
{:else if route.variant === 'b'}
  <CompactWorkspace store={workspaces.b} {route} />
{:else}
  <ListFirstApp store={workspaces.c} {route} />
{/if}
