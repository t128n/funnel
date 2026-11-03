<script context="module">
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  export function inline(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
</script>

<script>
  import { Table } from 'sveltestrap';

  export let blocks = [];
</script>

{#each blocks as block}
  {#if block.type === 'p'}
    <p class="mb-3">{@html inline(block.text)}</p>
  {:else if block.type === 'h2'}
    <h2 class="h5 mt-4 mb-2">{block.text}</h2>
  {:else if block.type === 'h3'}
    <h3 class="h6 mt-4 mb-2">{block.text}</h3>
  {:else if block.type === 'ul'}
    <ul class="mb-3 ps-4">
      {#each block.items as item}
        <li class="mb-1">{@html inline(item)}</li>
      {/each}
    </ul>
  {:else if block.type === 'ol'}
    <ol class="mb-3 ps-4">
      {#each block.items as item}
        <li class="mb-1">{@html inline(item)}</li>
      {/each}
    </ol>
  {:else if block.type === 'code'}
    <pre class="bg-body-tertiary border rounded p-3 small overflow-auto mb-3"><code>{block.text}</code></pre>
  {:else if block.type === 'quote'}
    <blockquote class="border-start border-3 ps-3 text-body-secondary mb-3">
      {@html inline(block.text)}
    </blockquote>
  {:else if block.type === 'table'}
    <Table size="sm" bordered class="mb-3">
      <thead>
        <tr>
          {#each block.head as cell}
            <th scope="col">{cell}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each block.rows as row}
          <tr>
            {#each row as cell}
              <td>{@html inline(cell)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </Table>
  {/if}
{/each}
