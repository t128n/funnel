# Changesets

This folder is managed by [Changesets](https://changesets.dev). Every user-facing
change should include a changeset describing its semver bump:

```sh
bun run changeset
```

That writes a Markdown file in this folder with YAML frontmatter naming the
package and bump type (`patch`, `minor`, or `major`), plus a summary that becomes
the changelog entry. Commit it with the change.

Funnel is a private application, so nothing is published to npm. The
`.changeset/config.json` file opts private packages into versioning and tagging;
the release workflow turns the generated `v<version>` tag into a GitHub release
with the platform executables.

Do not run `changeset version` by hand on `main` — the Changesets GitHub Action
opens a "Version packages" pull request and tags the release after that PR is
merged.

Useful commands:

| Command | Purpose |
| :--- | :--- |
| `bun run changeset` | Add a changeset for the current change. |
| `bun run changeset:status` | Show pending changesets and the release they will produce. |
| `bun run changeset:version` | Apply versions and changelogs locally (normally done by CI). |
