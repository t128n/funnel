# funnel

## 0.0.6

### Patch Changes

- e4a8230: Fix the Windows setup wizard reporting a false failure after a successful portable or service installation. If you used the 0.0.5 wizard, stop the already-started `funnel.exe` before retrying.

## 0.0.5

### Patch Changes

- 41863a9: Add a Windows setup wizard that creates `.env` from `.env.example`, validates the port and public URL, installs the service or starts a portable copy, and preserves an existing `FUNNEL_SECRET`.

## 0.0.4

### Patch Changes

- eb9e756: Add the read-only milestone timeline with the Apache ECharts Gantt chart, accessible milestone column, and sidebar entry.

## 0.0.3

### Patch Changes

- 840528a: Fix onboarding form submissions and state cookies when Funnel is opened directly over HTTP, including `http://127.0.0.1:3000`.

## 0.0.2

### Patch Changes

- 1877831: Add Changesets v3 release automation, fix standalone executable asset streaming so bundled CSS and fonts load, and ship `.env.example` in release archives.
