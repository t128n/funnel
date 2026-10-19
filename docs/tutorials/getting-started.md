# Getting started

This tutorial installs Funnel on your machine, creates its GitHub App through the in-app onboarding wizard, and leaves you signed in to the cockpit.

You will need a GitHub account and permission to create and install a GitHub App on that account. The whole path uses one personal account; organisation-owned Apps and GitHub Enterprise Server are noted at the end.

## 1. Install Bun

Funnel requires Bun 1.4.3 or newer. Install it with the Bun installer:

```sh
curl -fsSL https://bun.sh/install | bash
```

Open a new terminal (or source your shell profile) so `bun` is on `PATH`, then verify the version:

```sh
bun --version
```

**You should see:** a version number of `1.4.3` or higher.

> The repository's `mise.toml` pins Bun 1.4.3 for its build tasks. If you use mise, `mise install` installs the same version, and `mise trust` once per checkout lets the pinned `bun` resolve.

## 2. Clone or open the repository

Clone the repository, then enter its root:

```sh
git clone <repository-url> funnel
cd funnel
```

If you already have a checkout, open a terminal in that directory instead.

**You should see:** `package.json`, `mise.toml`, `src/`, and `drizzle/` in the current directory.

## 3. Install dependencies

```sh
bun install
```

**You should see:** Bun resolve the lockfile and finish without errors. A `node_modules/` directory now exists.

## 4. Create `.env` and generate a secret

Copy the example environment file:

```sh
cp .env.example .env
```

Generate a secret:

```sh
openssl rand -base64 32
```

Open `.env` and paste the output after `FUNNEL_SECRET=`. The value must be at least 32 characters; the generated one is 44.

```dotenv
FUNNEL_SECRET=the-value-you-just-generated
```

Leave `FUNNEL_URL` empty. In development Funnel derives the public origin from the request, which is what GitHub's callback and setup URLs need on `localhost`. `LOG_LEVEL=info` from the example is fine.

**You should see:** a `.env` file with a non-empty `FUNNEL_SECRET` and no quotes around it.

## 5. Apply the database schema

A fresh checkout has no database tables yet, so apply the committed migrations once:

```sh
bun run release
```

**You should see:** a line beginning `[release]`, reporting how many migrations were applied and naming the database path (`./data/funnel.db` by default).

## 6. Start the development server

```sh
bun run dev
```

**You should see:** Vite report that it is ready and print a local URL, normally `http://localhost:5173/`. Leave this terminal running.

## 7. Open onboarding and create the GitHub App

Open <http://localhost:5173/onboarding>.

**You should see:** a page headed **Set up Funnel**, with the steps **Create app**, **Install**, and **Repositories**, and a **Create the GitHub App** card.

1. Leave **Account** set to **My personal account**.
2. Keep the suggested **App name**, or change it. It must be unique across GitHub and may contain only letters, numbers, and hyphens (maximum 34 characters).
3. Click **Create GitHub App**.

Funnel submits a pre-filled App manifest to GitHub. On GitHub, review the registration page and click **Create GitHub App**.

**You should see:** GitHub redirect you back to Funnel at `/onboarding/install`, headed **Install the app**, with the App's name and owner shown.

> Funnel subscribes to no webhook events; it mirrors issues by polling. There is no webhook URL to configure.

## 8. Install the App

On the **Install the app** page, click **Install on GitHub**.

On GitHub's installation page, choose **Only select repositories**, select the repository you want to use, and click **Install**.

**You should see:** GitHub return you to Funnel at `/onboarding/installed`, headed **Choose repositories**, with a checkbox list containing that repository.

If GitHub shows an authorisation prompt first, approve it and continue to the installation page.

## 9. Choose a repository

Tick one repository, then click **Save and continue**.

**You should see:** Funnel redirect to `/login`, headed **Welcome to Funnel** with a **Continue with GitHub** button.

> The checkbox list only contains repositories the installation can access. If it is empty, the App was installed with no repositories; return to GitHub and add one to the installation.

## 10. Sign in

Click **Continue with GitHub** and authorise the App's OAuth client if GitHub asks.

**You should see:** the cockpit at `/inbox`, with the Funnel sidebar. Because this is the first account on the instance, your role is **admin**.

The Inbox may initially read **Inbox zero. Nothing staged or untriaged.** Funnel has started its first sync; existing issues appear in the Inbox (untriaged) and Issues views as the sync completes.

## 11. Check the cockpit

Use the sidebar to confirm the main views load:

| View | What it shows |
| :--- | :--- |
| **Inbox** | Staged intake submissions followed by open issues with no status label. |
| **My Issues** | Issues assigned to your GitHub identity. |
| **Attention** | Open, blocked issues with a re-check date in the next seven days. |
| **Issues** | Every triaged mirrored issue, filtered and grouped. |
| **Board** | Backlog as a separate list, plus Todo, In Progress, In Review, and Done lanes. |

Click **Settings** at the bottom of the sidebar (or press `Mod+,`) and confirm that **Repositories**, **Projects**, **Intake**, **Board**, **People**, **GitHub App**, **Sync**, and **Session** are visible. Those sections require the `admin` role.

**You should see:** the repository you selected under **Settings → Repositories**, and your account under **Settings → People** with the **Admin** role.

## Notes

- **Organisation-owned App.** At step 7, choose **An organization** and enter the organisation login instead of using your personal account. You must have permission to create Apps in that organisation.
- **GitHub Enterprise Server.** Set `GITHUB_URL` and `GITHUB_API_URL` in `.env` before starting the dev server (for example `https://acme.ghe.com` and `https://acme.ghe.com/api/v3`). Onboarding then targets that host.
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
