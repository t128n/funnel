<script>
  import { Badge, Card, CardBody } from 'sveltestrap';
</script>

<nav class="navbar bg-body border-bottom py-2">
  <div class="container">
    <span class="navbar-brand fw-semibold mb-0">funnel</span>
    <span class="small text-body-secondary">Composition study · November 2026</span>
  </div>
</nav>

<main class="container py-5">
  <div class="row justify-content-center">
    <div class="col-lg-10">
      <p class="small text-uppercase text-body-secondary mb-2">Design exercise</p>
      <h1 class="display-6 mb-3">Three ways to compose Funnel</h1>
      <p class="lead text-body-secondary mb-4">
        The same fixture data, issue document, triage flow, and interactions, arranged three ways.
        The question is not which one looks most modern. It is which one makes issue work easiest to scan,
        read, and operate without adding application chrome.
      </p>
    </div>
  </div>

  <div class="row g-4 mt-1">
    <div class="col-lg-4">
      <Card class="h-100">
        <CardBody class="d-flex flex-column">
          <div class="d-flex align-items-center gap-2 mb-2">
            <Badge color="dark">A</Badge>
            <span class="small text-body-secondary">Conventional application</span>
          </div>
          <h2 class="h5">Traditional Bootstrap application</h2>
          <p class="text-body-secondary">
            Dark navbar, one navigation layer, standard form controls, a centered table,
            and a dedicated issue page with a properties card.
          </p>
          <ul class="small text-body-secondary ps-4">
            <li>Closest to the WARC Specifications reading experience.</li>
            <li>Strongest use of stock Bootstrap pages and controls.</li>
            <li>List and document each get a conventional page.</li>
          </ul>
          <div class="d-flex flex-wrap gap-2 mt-auto pt-2">
            <a class="btn btn-sm btn-primary" href="#/a/issues">Open issues</a>
            <a class="btn btn-sm btn-outline-secondary" href="#/a/inbox">Inbox</a>
            <a class="btn btn-sm btn-outline-secondary" href="#/a/issues/FUN-58">Issue</a>
          </div>
        </CardBody>
      </Card>
    </div>

    <div class="col-lg-4">
      <Card class="h-100">
        <CardBody class="d-flex flex-column">
          <div class="d-flex align-items-center gap-2 mb-2">
            <Badge color="dark">B</Badge>
            <span class="small text-body-secondary">Master-detail</span>
          </div>
          <h2 class="h5">Compact workspace</h2>
          <p class="text-body-secondary">
            A subdued sidebar, dense issue list, and a document pane. Metadata becomes a single
            line of quiet text controls instead of a row of pills or a properties card.
          </p>
          <ul class="small text-body-secondary ps-4">
            <li>Fastest repeated issue-to-issue browsing.</li>
            <li>Keeps context while reading and commenting.</li>
            <li>Closest to the current production workflow.</li>
          </ul>
          <div class="d-flex flex-wrap gap-2 mt-auto pt-2">
            <a class="btn btn-sm btn-primary" href="#/b/issues/FUN-58">Open issues</a>
            <a class="btn btn-sm btn-outline-secondary" href="#/b/inbox">Inbox</a>
            <a class="btn btn-sm btn-outline-secondary" href="#/b/issues">List</a>
          </div>
        </CardBody>
      </Card>
    </div>

    <div class="col-lg-4">
      <Card class="h-100">
        <CardBody class="d-flex flex-column">
          <div class="d-flex align-items-center gap-2 mb-2">
            <Badge color="dark">C</Badge>
            <span class="small text-body-secondary">List-first</span>
          </div>
          <h2 class="h5">Broad issue index</h2>
          <p class="text-body-secondary">
            A full-width table for scanning title, state, size, owner, and milestone, with a
            dedicated document page for reading and acting.
          </p>
          <ul class="small text-body-secondary ps-4">
            <li>Most horizontal room for titles and metadata.</li>
            <li>No permanent detail pane competing with the list.</li>
            <li>Natural responsive behavior and the least layout code.</li>
          </ul>
          <div class="d-flex flex-wrap gap-2 mt-auto pt-2">
            <a class="btn btn-sm btn-primary" href="#/c/issues">Open issues</a>
            <a class="btn btn-sm btn-outline-secondary" href="#/c/inbox">Inbox</a>
            <a class="btn btn-sm btn-outline-secondary" href="#/c/issues/FUN-58">Issue</a>
          </div>
        </CardBody>
      </Card>
    </div>
  </div>

  <p class="small text-body-secondary mt-4 mb-0">
    All three share the same issue fixtures, search, filters, grouping, metadata edits, comments, and inbox triage.
    State is in memory only. The Board, Matrix, Plan, and Timeline destinations are represented in navigation but
    intentionally outside this study.
  </p>
</main>
