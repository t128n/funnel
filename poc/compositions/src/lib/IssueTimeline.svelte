<script>
  import { Button, Input } from 'sveltestrap';
  import IssueBody from './IssueBody.svelte';
  import { commentCount, person } from './issueModel.js';

  export let issue;
  export let onComment = () => {};
  export let compact = false;

  let commentText = '';
  let input;

  $: comments = commentCount(issue);

  function actorName(login) {
    return person(login)?.name || login || 'System';
  }

  function submit() {
    const text = commentText.trim();
    if (!text) {
      input?.focus();
      return;
    }

    onComment(issue.id, text);
    commentText = '';
  }

  function handleKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }
</script>

<section class="mt-4 pt-4 border-top" aria-labelledby="activity-heading">
  <div class="d-flex align-items-baseline justify-content-between gap-2 mb-2">
    <h2 class="h6 mb-0" id="activity-heading">Activity</h2>
    <span class="small text-body-secondary">{comments} {comments === 1 ? 'comment' : 'comments'}</span>
  </div>

  <div>
    {#each issue.timeline as item}
      {#if item.type === 'event'}
        <div class="d-flex gap-2 small text-body-secondary py-2">
          <i class={`bi ${item.icon || 'bi-dot'} mt-1 flex-shrink-0`} aria-hidden="true"></i>
          <p class="mb-0">
            <span class="fw-semibold text-body">{actorName(item.actor)}</span>
            {item.action}
            <span class="ms-1 text-body-tertiary">· {item.time}</span>
          </p>
        </div>
      {:else}
        <div class="d-flex gap-3 py-3 border-top">
          <i class="bi bi-person-circle fs-4 text-body-secondary flex-shrink-0" aria-hidden="true"></i>
          <div class="min-w-0 flex-grow-1">
            <div class="small mb-2">
              <span class="fw-semibold">{actorName(item.author)}</span>
              <span class="text-body-secondary">commented {item.time}</span>
            </div>
            <div class={compact ? 'small' : ''}>
              <IssueBody blocks={item.body} />
            </div>
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <form class="mt-3 pt-3 border-top" on:submit|preventDefault={submit}>
    <label class="form-label small fw-semibold" for="comment-input">Add a comment</label>
    <Input
      bind:this={input}
      bind:value={commentText}
      type="textarea"
      rows="3"
      id="comment-input"
      data-testid="comment-input"
      placeholder="Leave a comment… Use Cmd+Enter to submit."
      on:keydown={handleKeydown}
    />
    <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
      <span class="small text-body-secondary">Markdown supported</span>
      <Button color="primary" size="sm" type="submit" data-testid="comment-submit">Comment</Button>
    </div>
  </form>
</section>
