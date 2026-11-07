# Getting started

Install Funnel on a Windows x64 machine from a release ZIP, create a GitHub App, and sign in to the cockpit. The standalone executable includes its runtime; Bun, Node.js, Docker, and a source checkout are not required.

You need Windows 10 1903+, Windows 11, or Windows Server 2016+, a GitHub account allowed to create and install an App, and outbound HTTPS access to GitHub. A Windows service requires administrator approval and .NET Framework 4.6.1 or newer. This tutorial uses a personal GitHub account. For Linux, macOS, custom paths, or a service deployment, see [Install Funnel](../how-to/deploy/install.md).

## 1. Download and extract the release

1. Open the [GitHub Releases page](https://github.com/t128n/funnel/releases) and download `funnel-<version>-windows-x64.zip` from the release assets. For example, the published 0.0.12 prerelease contains `funnel-0.0.12-windows-x64.zip` and `SHA256SUMS.txt`. Select a suitable release from the listing. The 0.0.12 server ZIP also bundles the optional intake helper; current packaging creates a separate helper ZIP for future releases, if published.

   **You should see:** a ZIP whose name starts with `funnel-` and ends in `-windows-x64.zip`.

2. Download `SHA256SUMS.txt` from the same release, then in PowerShell from your downloads folder verify the ZIP:

   ```powershell
   Get-FileHash .\funnel-<version>-windows-x64.zip -Algorithm SHA256
   ```

   **You should see:** a hash matching the ZIP's line in `SHA256SUMS.txt`. If it differs, download the ZIP again.

3. Extract the entire ZIP to a folder and open that folder. Keep the files together; do not run the executable inside the ZIP.

   **You should see:** `funnel.exe`, `funnel-service.exe`, `.env.example`, `README.txt`, and a launcher (`setup.cmd` in 0.0.12; current packaging uses `START-HERE.cmd`). Windows may hide file extensions.

## 2. Run setup

1. Open PowerShell in the extracted folder and run:

   ```powershell
   .\funnel.exe setup
   ```

   Alternatively, double-click the launcher included in your ZIP (`setup.cmd` or `START-HERE.cmd`).

   **You should see:** the Funnel setup prompts. If Windows asks for administrator approval, approve it only if you chose the Windows service.

2. Choose **Windows service** to start at boot, or **Portable process** for a trial without a service. Accept the default paths and port, or choose your own. Leave the public URL empty for a local trial; if others can reach the fresh instance, protect onboarding with a token and keep it safe.

   **You should see:** setup write or keep the configuration, start Funnel, and print `Funnel is running:` followed by an onboarding URL. It attempts to open that URL in your browser. If readiness is not yet ready, setup prints a warning; check it in the next step.

   A service listens on all interfaces by default and setup adds an inbound firewall rule. Restrict network access as appropriate; see the [production checklist](../how-to/operate/production-checklist.md). For a public hostname or proxy, set the exact public URL before onboarding.

## 3. Verify the installation

1. In PowerShell in the extracted folder, run:

   ```powershell
   .\funnel.exe status
   ```

   **You should see:** service/process, health, and readiness checks, followed by version, mode, paths, and URL. Confirm the service or process is running and both health and readiness are OK. With a custom config path, use `--manifest <path-to-install.json>`.

2. If setup did not open the browser, open the printed onboarding URL. Use the port you selected, rather than assuming port 3000.

   **You should see:** **Create the GitHub App**, or **Token Required** if you protected onboarding. If setup or status fails, run `.\funnel.exe doctor` and `.\funnel.exe logs`, then consult [Troubleshoot Funnel](../how-to/operate/troubleshoot.md).

## 4. Open onboarding and create the GitHub App

Open the onboarding URL printed by setup (normally <http://127.0.0.1:3000/onboarding>).

**You should see:** a page headed **Create the GitHub App**, with the steps **Create app**, **Install**, and **Ready**, and an **App details** form.

1. Leave **Account** set to **My personal account**.
2. Leave **GitHub host** as `github.com`, unless you use GitHub Enterprise Server.
3. Keep the suggested **App name**, or change it. It must be unique across GitHub and may contain only letters, numbers, and hyphens (maximum 34 characters).
4. Click **Create GitHub App**.

Funnel submits a pre-filled App manifest to GitHub. On GitHub, review the registration page and click **Create GitHub App**.

**You should see:** GitHub redirect you back to Funnel at `/onboarding/install`, headed **Install the GitHub App**, with the App's name and owner shown.

> Funnel polls GitHub for issue, comment, pull-request and check changes, so it works behind a firewall and GitHub never needs an inbound connection to the server.

## 5. Install the App

On the **Install the GitHub App** page, click **Install on GitHub**.

On GitHub's installation page, choose **Only select repositories**, select the repository you want to use, and click **Install**.

**You should see:** GitHub return you to Funnel at `/onboarding/installed`, headed **Funnel Is Ready**, with a **Repositories** checkbox list containing that repository.

If GitHub shows an authorisation prompt first, approve it and continue to the installation page.

## 6. Choose a repository

Tick one repository, then click **Save and Continue**.

**You should see:** Funnel redirect to `/login`, headed **Sign In**, with a **Continue with GitHub** button.

> The checkbox list only contains repositories the installation can access. If it is empty, the App was installed with no repositories; return to GitHub and add one to the installation.

## 7. Sign in

Click **Continue with GitHub** and authorise the App's OAuth client if GitHub asks.

**You should see:** the cockpit at `/inbox`, with the Funnel sidebar. Because this is the first account on the instance, your role is **admin**.

The Inbox may initially read **Inbox zero. Nothing staged or untriaged.** Funnel has started its first sync; existing issues appear in the Inbox (untriaged) and Issues views as the sync completes.

## 8. Check the cockpit

Use the sidebar to confirm the main views load:

| View | What it shows |
| :--- | :--- |
| **Inbox** | Staged intake submissions followed by open issues with no status label. |
| **My Issues** | Issues assigned to your GitHub identity. |
| **Attention** | Open, blocked issues grouped by re-check date, including those without one. |
| **Issues** | Every triaged mirrored issue, filtered and grouped. |
| **Board** | Backlog as a separate list, plus Todo, In Progress, In Review, and Done lanes. |

Click **Settings** at the bottom of the sidebar (or press `Mod+,`) and confirm that **Repositories**, **Projects**, **Intake**, **Board**, **People**, **GitHub App**, **Sync**, and **Session** are visible. Those sections require the `admin` role.

**You should see:** the repository you selected under **Settings → Repositories**, and your account under **Settings → People** with the **Admin** role.

## Notes

- **Organisation-owned App.** At step 4, choose **An organization** and enter the organisation login instead of using your personal account. You must have permission to create Apps in that organisation.
- **GitHub Enterprise Server.** Enter the Enterprise host in the onboarding wizard. See [GitHub Enterprise Server](../how-to/deploy/github-enterprise-server.md).
- **A non-local hostname.** Set `FUNNEL_URL` to the public origin before onboarding, so GitHub redirects back to the address users actually reach.
- **Gating a fresh instance.** Set `FUNNEL_ONBOARDING_TOKEN` before first start if the instance is reachable by others; the wizard then asks for that token.

## Related

- [Triage a backlog](triage-a-backlog.md)
- [Onboard the GitHub App](../how-to/configure/onboard-github-app.md)
- [Configure repositories](../how-to/configure/repositories.md)
- [Environment variables](../reference/environment-variables.md)
- [CLI](../reference/cli.md)
- [Deployment model](../explanation/deployment-model.md)
- [Documentation index](../README.md)
