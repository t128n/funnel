# Add or remove repositories

Choose the `owner/name` repositories that Funnel mirrors, writes to, and shows in the cockpit.

Only an administrator can open **Settings → Repositories**; other roles receive a 403 even on a direct URL, and the save action re-checks the role server-side.

## Before you start

- Sign in as an administrator.
- The GitHub App must be installed on the repository. An installation can grant access to all repositories or a selected subset; check it with **Settings → GitHub App → Manage installation**.
- Adding a repository does not contact GitHub immediately. A correctly formatted `owner/name` is accepted even if Funnel cannot reach it, so a typo shows up as a failed sync rather than a save error.

## Add a repository

1. Open **Settings → Repositories** to see the current list.
2. Select **Add repository** and enter the repository in `owner/name` form; a new row holds its configuration.
3. Optionally enter a **Shortcode** of up to six characters.
4. Repeat for any further repositories and select **Save changes**. Check **Settings → Sync** for the first poll and repository health.

The GitHub host shown at the top of the page is read-only. Change `GITHUB_URL` / `GITHUB_API_URL` and restart to move the instance to another host.

### Shortcode rules

- A shortcode must start with a letter, may contain only letters and numbers, and is at most six characters.
- It is uppercased when saved, so `fit` becomes `FIT`.
- Shortcodes must be unique across configured repositories, including shortcodes derived from repository names.
- Leave the field blank to derive one. Funnel uses the initials of the repository name's word parts (`funnel-issue-tracker` → `FIT`), or the whole name for a single word (`core` → `CORE`), truncated to six characters and uppercased.
- If a derived shortcode collides with another repository, the save fails. Enter an explicit shortcode to disambiguate.

The shortcode is the identifier shown on board cards and issue rows (`FIT-12`). Changing it changes those labels immediately; GitHub issue numbers and URLs are unchanged. If a mirrored repository is no longer configured, Funnel falls back to the derived shortcode.

### Repository rules

- Values are trimmed and must match `owner/name`, using letters, numbers, underscores, dots, and hyphens.
- Duplicate entries are ignored case-insensitively; the first entry wins.
- A blank row is ignored by the form. An empty value submitted directly is rejected.

## Remove a repository

1. Open **Settings → Repositories**.
2. Select the bin button beside the repository and select **Save changes**.

If the repository is the **Intake default**, change that first under **Settings → Intake**. The save is rejected with `intake.default_repo must be one of the configured repos` until the default points at a remaining repository or is cleared.

To remove every repository, set the Intake default to **First repository** (which clears it) before saving the empty list.

### What removal does to the mirror

Removal is not a purge. On the next scheduler tick Funnel stops polling the repository, but rows already mirrored for it are not deleted by the removal; pruning only happens while a repository is polled or reconciled. Those issues can therefore remain visible in the cockpit after removal, rendered with the fallback derived shortcode. Re-adding the same `owner/name` resumes from the retained cursor and ETag.

Mirror pruning that does happen is driven by the history window: closed issues outside it are deleted when seen, and the nightly reconciliation removes issues that no longer exist upstream. See [Configure sync](sync.md).

## Validation and access errors

The save fails, and leaves the previous configuration untouched, when:

- a repository is not in `owner/name` form;
- a shortcode does not start with a letter or is longer than six characters;
- two repositories end up with the same shortcode;
- removing a repository would strand the Intake default.

Access problems are not validation errors. If the App is not installed on a configured repository, the sync cycle fails, is logged, and is retried on the next cycle. Failures after Funnel has created the repository's mirror row are marked as degraded. On-demand requests for that repository return a 404 with `Not synced, open on GitHub`. Reserved-label provisioning reports the repository as failed at startup and during reconciliation. See [Reserved labels](../../reference/reserved-labels.md).

## After saving

Funnel merges the repository list into the instance settings, revalidates the whole configuration (including cross-field rules), and writes it in one transaction. It then drops the cached configuration, tells the sync scheduler to re-read it, and broadcasts a `settings` event so open cockpits refresh. No restart is needed.

A newly added repository is scheduled for its first poll with a stagger so several additions do not burst at once. Labels and assignable users are refreshed on each cycle; canonical reserved labels are provisioned at startup and during the nightly reconciliation.

## Related

- [Onboard the GitHub App](onboard-github-app.md)
- [Configure projects](projects.md)
- [Configure sync](sync.md)
- [Settings reference](../../reference/settings.md)
- [Reserved labels](../../reference/reserved-labels.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
