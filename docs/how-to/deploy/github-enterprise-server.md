# Use GitHub Enterprise Server

Point Funnel's web and API hosts at a GitHub Enterprise Server (GHES) instance before running the onboarding wizard.

## Before you start

- A GitHub Enterprise Server host reachable from the Funnel server, for example `https://acme.ghe.com`.
- A GitHub account that can create GitHub Apps for the chosen account or organisation, and can install the App on the repositories Funnel will mirror.
- `FUNNEL_SECRET` set to at least 32 characters, as for any Funnel deployment.
- `FUNNEL_URL` set to the public origin of the Funnel instance, for example `https://funnel.acme.com`. Set it before onboarding; the App's callback URL is derived from it.
- A GHES version that supports GitHub Apps and the App Manifest Flow. Funnel creates its App through that flow and has no environment-variable fallback for App credentials, so both must be available on the host.

## 1. Set both GitHub hosts

Set **both** variables, together, before the first boot or before onboarding:

```dotenv
GITHUB_URL=https://acme.ghe.com
GITHUB_API_URL=https://acme.ghe.com/api/v3
FUNNEL_URL=https://funnel.acme.com
```

- `GITHUB_URL` is the web host. Funnel uses it for the manifest form, the App installation URL, and outbound issue and profile links.
- `GITHUB_API_URL` is the REST base and ends in `/api/v3`. Funnel derives GraphQL from it, so `https://acme.ghe.com/api/v3` becomes `https://acme.ghe.com/api/graphql`.
- Do not use `https://api.acme.ghe.com`; that is not the GHES API shape.
- Omit trailing slashes from both GitHub URLs; `FUNNEL_URL` should be the bare public origin.

Both variables have GitHub Cloud defaults (`https://github.com` and `https://api.github.com`). Setting only one leaves the other pointing at Cloud, which produces confusing split behaviour: the manifest form may open on github.com while the API call goes to GHES, or the reverse.

Apply the change the same way you manage the deployment:

- Windows service: edit `C:\ProgramData\Funnel\.env`, then run `C:\ProgramData\Funnel\funnel-service.exe restart`.
- PaaS: change the service variables and redeploy.

These hosts are read at boot; there is no settings-page field for them.

## 2. Make sure the host trusts GHES

If GHES uses a certificate from a private certificate authority, the Funnel host must trust that CA. On Debian or Ubuntu, copy the certificate to `/usr/local/share/ca-certificates/` and run `sudo update-ca-certificates`. On Windows, import it into the machine's trusted root store:

```powershell
Import-Certificate -FilePath acme-ca.cer -CertStoreLocation Cert:\LocalMachine\Root
```

A TLS failure during the manifest exchange or the first sync is the usual symptom of a missing CA.

Keep the Funnel host's clock synchronised (NTP). GitHub App JWTs and OAuth exchanges are time-sensitive; large clock skew produces authentication errors that look like credential failures.

## 3. Run onboarding against GHES

Open `https://funnel.acme.com/`; the first-run gate sends you to `/onboarding`.

1. Confirm the page shows your GHES host, not github.com.
2. Choose **My personal account** or **An organization**. For an organisation, enter its GitHub login; you must be allowed to create Apps for that organisation.
3. Enter an App name. It must be unique on the GHES host. The suggested name is derived from the Funnel hostname.
4. Select **Create GitHub App**. The browser posts the manifest to `https://acme.ghe.com/settings/apps/new` or `https://acme.ghe.com/organizations/<org>/settings/apps/new`, and GitHub shows a pre-filled registration page.
5. Confirm the App on GHES. The manifest requests Issues write, Metadata read and Contents read, and subscribes to no webhook events because Funnel polls for changes.
6. GHES redirects back to `/onboarding/callback`, where Funnel exchanges the one-time code and stores the credentials encrypted in the database.
7. On the installation page, install the App on the organisation or account that owns the repositories. Choose all repositories or the specific ones you intend to mirror. Creating an App grants no repository access until it is installed.
8. Back in Funnel, select the repositories to configure and save. You are sent to `/login`; sign in with GitHub.

## 4. Verify

- `GET https://funnel.acme.com/healthz` returns `200`.
- `GET https://funnel.acme.com/readyz` returns `200` with `applied` and `expected` counts. A fresh instance may return `503` until migrations finish.
- **Settings → GitHub App** shows the App name, owner, App ID, slug, client ID and installation ID, with an **Installed** badge. The "Open App" link should point at the GHES host.
- **Settings → Repositories** lists the repositories chosen during onboarding.
- The logs show `github app created` with the App id and slug and `sync worker started`. Successful polls are logged at `debug` as `repo polled`; set `LOG_LEVEL=debug` if you want to see them. At the default `info`, the useful signal is the absence of `repo poll failed` warnings.
- Issues appear after the first poll. With a cockpit tab open the interval is 30 seconds; idle it is 300 seconds, and new repositories are staggered across the interval.

To check connectivity from the Funnel host (or a host with the same trust store):

```sh
curl -fsS https://acme.ghe.com/api/v3/meta
```

On Windows PowerShell:

```powershell
Invoke-RestMethod https://acme.ghe.com/api/v3/meta
```

A TLS error here will also fail manifest conversion and sync.

## 5. Caveats and changes

- **Both hosts, every time.** If either is wrong, onboarding or sync fails. Correct both, restart, then reset the App and onboard again if credentials were created against the wrong host.
- **Changing hosts after onboarding does not migrate the App.** The stored App credentials exist on the old host. Correct the environment, restart, open **Settings → GitHub App** as an administrator and select **Reset GitHub App**, then complete onboarding on the new host. Reset leaves the database and mirror in place, but the wizard's repository selection replaces the configured repository list, so re-check **Settings → Repositories** afterwards.
- **Changing `FUNNEL_URL` after onboarding changes the OAuth base.** The App's callback URL is registered during onboarding. If the public origin changes, update the App's callback URL on GHES to `https://<new-origin>/api/auth/callback/github`, or reset and re-onboard. The cleanest sequence is to set `FUNNEL_URL` before the first onboarding.
- **Permission changes need approval on the installation.** If you broaden the App's permissions on GHES, the installation may need to approve the new permissions before sync or writes succeed.
- **No webhooks.** Funnel does not receive GitHub webhooks and does not need a webhook URL. It polls outbound, so the Funnel host needs outbound HTTPS to GHES, not inbound access from GHES.
- **Repository access is per installation.** A repository configured in Funnel but not granted to the App's installation fails sync and returns `Not synced, open on GitHub` on demand. Add it to the installation in GHES, then let the next poll run.

## Related

- [Environment variables](../../reference/environment-variables.md) — `GITHUB_URL` and `GITHUB_API_URL` defaults and constraints.
- [Command-line interface](../../reference/cli.md) — release and health flags.
- [Deployment model](../../explanation/deployment-model.md) — the single-instance deployment and onboarding gate.
- [Onboard the GitHub App](../configure/onboard-github-app.md) — the full manifest flow.
- [Add or remove repositories](../configure/repositories.md)
- [Install Funnel](install.md)
- [Install Funnel](install.md)
- [Put Funnel behind a reverse proxy](reverse-proxy.md)
- [Troubleshoot](../operate/troubleshoot.md)
