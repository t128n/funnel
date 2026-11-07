# Onboard the GitHub App

Create and install the GitHub App that lets Funnel authenticate users, mirror issues, and write back to GitHub.

## Before you start

- The browser completing onboarding must be able to reach the Funnel URL registered with GitHub, including after GitHub redirects it. For a public hostname or proxy, set `FUNNEL_URL` to that exact origin (for example `https://funnel.example.com`); without it, Funnel uses the origin of the incoming request. A local trial can use the setup URL on the same machine.
- Funnel polls GitHub, so GitHub never needs an inbound connection to the server. The App manifest registers no webhook and subscribes to no events.
- You can enter the GitHub host in the wizard: `github.com`, or a GitHub Enterprise Server host such as `acme.ghe.com`. `GITHUB_URL` and `GITHUB_API_URL` only set the pre-onboarding default. See [Use GitHub Enterprise Server](../deploy/github-enterprise-server.md).
- If the instance is reachable before it has been claimed, set `FUNNEL_ONBOARDING_TOKEN`. Without it, anyone who can reach a fresh instance can complete onboarding.

No Funnel account or administrator role is needed for the wizard itself: it is intentionally reachable before authentication exists. Once the App credentials are stored, the first step closes to new runs — visiting `/onboarding` then redirects to `/login` — and you continue through the installation steps before signing in.

## How the first-run gate works

While no App credentials exist, every route redirects to `/onboarding`. The exceptions are the wizard itself (`/onboarding` and its sub-paths), `/healthz`, `/readyz`, `/_app` assets, `/api/auth/*`, and paths whose last segment contains a dot. Once credentials exist, `/onboarding` redirects to `/login`.

## Create and install the App

1. Open the instance. The first-run gate sends you to **Create the GitHub App** at `/onboarding`.
2. If the page is locked, enter the value of `FUNNEL_ONBOARDING_TOKEN`. Funnel keeps the accepted token in an `HttpOnly` cookie for one hour; reopen the wizard with it if the cookie expires.
3. Under **Account**, choose **My personal account** or **An organization**.
   - For an organisation, enter its GitHub login. You must be allowed to create Apps for that organisation.
4. Enter a **GitHub host**: `github.com`, or your GitHub Enterprise Server web host such as `acme.ghe.com`. A bare host is treated as HTTPS; you can also paste a full URL.
5. Enter an **App name**. The form suggests `funnel-<hostname-label>` and allows up to 34 characters; GitHub requires the name to be unique across the host.
6. Select **Create GitHub App**. Funnel posts a manifest to the selected GitHub host and GitHub opens a pre-filled registration page. Confirm it there. The manifest requests Issues write, Metadata read, Contents read, Pull requests read, and Checks read permissions. It registers no webhook and subscribes to no events, so onboarding works on a server behind a firewall. Label changes and linked pull-request/check state are picked up by polling. Pull requests and checks are read-only: Funnel mirrors linked PR state, reviews and check rollups but never writes to a pull request or reruns checks.
7. GitHub redirects back to Funnel, which exchanges the one-time code for the App credentials and stores them encrypted in the database. The selected GitHub host is stored with the credentials, so later sync, links, and OAuth use the same host. You land on **Install the GitHub App**.
8. Select **Install on GitHub** and choose either all repositories or specific ones on GitHub's installation page. Creating an App grants no repository access until it is installed.
9. GitHub returns you to **Funnel Is Ready**. Select at least one repository in the **Repositories** section, then select **Save and Continue**. The selection is saved as the instance's repository list and you are sent to `/login`.
10. Select **Continue with GitHub** and authorise the App. You should reach the Inbox. The first Funnel account to sign in is promoted to administrator; later accounts start with the `read` role. See [People and roles](people-and-roles.md).
11. Open **Settings → Repositories** and **Settings → Sync**. The selected repository should be listed; the initial sync may take time. If issues do not appear, see [troubleshooting](../operate/troubleshoot.md#no-issues-appear-in-the-cockpit), then try [triaging a backlog](../../tutorials/triage-a-backlog.md).

## Approve added permissions on an existing App

Funnel added the `pull_requests: read` and `checks: read` scopes in issue #28. GitHub does not grant new permissions to an existing installation automatically. After upgrading:

1. Open **Settings → GitHub App** and select the link to the App on GitHub (or open the installation from the organisation settings).
2. On the App's **Permissions & events** page, review the new **Pull requests (read)** and **Checks (read)** permissions. Existing installations show a banner asking the owner to approve the update.
3. Approve the update for each installation. Until it is approved, linked-PR discovery and check reads fail with a permissions error; issue mirroring continues, and the next poll repairs the development panel once access is granted.

New installations created from the manifest already include the scopes, so no extra step is needed.

## GitHub Enterprise hosts

Enter the GHES web host in the wizard's **GitHub host** field (`acme.ghe.com` or `https://acme.ghe.com`). Funnel derives the API base as `https://acme.ghe.com/api/v3`, stores both with the App credentials, and uses them for the manifest form, OAuth callbacks, installation URL, REST calls, GraphQL calls, and links. No environment change or restart is needed.

`GITHUB_URL` and `GITHUB_API_URL` only set the host the wizard suggests before an App exists. If you prefer to configure them, set both before onboarding. If the stored host is wrong, reset the App and run onboarding again with the correct host. See [Use GitHub Enterprise Server](../deploy/github-enterprise-server.md) and [Environment variables](../../reference/environment-variables.md).

## If the wizard reports an error

- **Enter a name / Enter the organization / Enter a valid GitHub host** — the corresponding field was empty or the host could not be parsed.
- **The request could not be verified** — the manifest `state` cookie was missing or did not match. Start the flow again.
- **GitHub rejected the manifest conversion** — the one-time code could not be exchanged. Start again; if it keeps failing, check that the instance can reach the configured API host.
- **Installation not found** — Funnel did not receive an installation id and could not find exactly one installation. Install the App on GitHub, then return to `/onboarding/installed`.
- **Could not list the installation's repositories** — the App is installed but Funnel cannot read its repository list, so the repository checklist is empty and the save button stays disabled. Sign in at `/login` and add repositories later in **Settings → Repositories**.

## Manage or reset the App

Administrators can open **Settings → GitHub App**. The page shows the App name, owner, GitHub host, App ID, slug, client ID, installation id, and a link to the App on GitHub. Secrets are not displayed. The action button opens GitHub's installation page, where you can install the App or change which repositories it can access.

**Reset GitHub App** forgets the stored credentials and resets the cached GitHub and authentication clients. This returns the whole instance to onboarding: every route is gated again until a new App is created, and repository access needs the new App to be installed. The App itself is **not** deleted on GitHub, and existing settings and mirrored issues are left in the database, but you will need to create and install an App again. The wizard's repository step replaces the configured repository list, so re-check **Settings → Repositories** afterwards. If you want to reuse the old name, delete the old App on GitHub first.

## After onboarding

- Repository selection is only a starting point; change it under [Repositories](repositories.md).
- The first signed-in account is the instance administrator and can assign roles under [People and roles](people-and-roles.md).
- Funnel provisions its reserved labels on configured repositories at startup and during the nightly reconciliation. See [Reserved labels](../../reference/reserved-labels.md).

## Related

- [Add or remove repositories](repositories.md)
- [People and roles](people-and-roles.md)
- [Configure sync](sync.md)
- [Use GitHub Enterprise Server](../deploy/github-enterprise-server.md)
- [Settings reference](../../reference/settings.md)
- [Environment variables](../../reference/environment-variables.md)
- [Roles and permissions](../../reference/roles-and-permissions.md)
