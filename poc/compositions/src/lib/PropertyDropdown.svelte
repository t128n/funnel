<script>
  import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from 'sveltestrap';

  export let label;
  export let icon = 'bi-circle';
  export let value;
  export let options = [];
  export let onSelect = () => {};
  export let compact = false;
  export let tone = 'body';
  export let testid = undefined;

  $: selected = options.find((option) => option.value === value) || options[0];
  $: selectedLabel = selected ? selected.label : 'Not set';
</script>

<Dropdown>
  <DropdownToggle
    color={compact ? 'link' : 'outline-secondary'}
    size="sm"
    caret
    class={compact ? 'text-decoration-none text-body p-0 d-inline-flex align-items-center gap-1' : 'd-inline-flex align-items-center gap-1'}
    aria-label={`Change ${label.toLowerCase()}`}
    data-testid={testid}
  >
    <i class={`bi ${icon} text-${tone}`} aria-hidden="true"></i>
    <span>{selectedLabel}</span>
  </DropdownToggle>
  <DropdownMenu end>
    <h6 class="dropdown-header">{label}</h6>
    {#each options as option}
      <DropdownItem
        active={option.value === value}
        on:click={() => onSelect(option.value)}
      >
        <span class="d-flex align-items-center justify-content-between gap-3">
          <span>{option.label}</span>
          {#if option.value === value}
            <i class="bi bi-check2" aria-hidden="true"></i>
          {/if}
        </span>
      </DropdownItem>
    {/each}
  </DropdownMenu>
</Dropdown>
