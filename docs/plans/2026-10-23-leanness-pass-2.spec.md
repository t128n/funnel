# Leanness pass 2

## 1. Unused UI components

Delete shadcn-svelte leaves that have no named or namespace consumer in the app.
Keep every component that is currently used; regenerate individual leaves later
with `shadcn-svelte add` if needed.

## 2. Dead exports and duplicate config

Remove exports with no production or test caller, and remove `DEFAULT_CONFIG`,
which duplicates the per-key defaults in the settings store.

## 3. API route plumbing

Share the repeated issue-number validation and user-token write authentication
across the write routes, keeping every status code and response body unchanged.

## 4. Issue detail routes

Share the three near-identical issue detail wrappers without changing routing,
SSR, or the malformed-link 404.

## 5. Priority-in-body metadata

Remove the priority read/write helpers from the body metadata envelope. Priority
is derived from labels; no production caller reads or writes a `priority:` body
section.

## 6. Repository cleanup

Remove the one-off raster icon generator and completed run logs. Keep the plan
and spec documents themselves.
