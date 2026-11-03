<script>
  import { Alert } from 'sveltestrap';

  export let title;
  export let variant = 'a';
</script>

<div class="container py-5">
  <div class="row justify-content-center">
    <div class="col-lg-8">
      <p class="small text-uppercase text-body-secondary mb-2">Composition study</p>
      <h1 class="h3">{title}</h1>
      <Alert color="light" class="border mt-4">
        <p class="mb-2">This view is outside the scope of the composition study.</p>
        <p class="small text-body-secondary mb-0">
          The study compares Inbox, the issue index, and the issue document. The navigation treatment is real; the
          destination is intentionally left alone so it does not distract from the layouts under review.
        </p>
      </Alert>
      <a class="btn btn-outline-secondary btn-sm" href={`#/${variant}/issues`}>
        <i class="bi bi-arrow-left me-1" aria-hidden="true"></i>Back to issues
      </a>
    </div>
  </div>
</div>
