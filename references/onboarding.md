# Onboarding - once per machine

Run `node <skill-dir>/scripts/doctor.mjs` after each step; it is read-only and tells you what is
still missing. Do the steps in order. **Secrets are typed into the user's own terminal, never
pasted into the chat.**

State lives in `~/.marketing-site-factory/` (override with `MSF_HOME`):
`config.json` (non-secret), `credentials.json` (secret), `sites.json` (registry),
`google-service-account.json` (secret).

---

## 1. Core tools

| Tool | Install | Check |
| --- | --- | --- |
| Node.js 18+ (22+ only if deploying Workers) | https://nodejs.org/ | `node -v` |
| git | https://git-scm.com/downloads | `git --version` |
| Python 3.9+ (the image CLI is one Python file) | https://www.python.org/downloads/ | `python --version` |

## 2. GitHub CLI

1. Install: https://cli.github.com/ (`winget install GitHub.cli`, `brew install gh`).
2. `gh auth login` -> GitHub.com -> HTTPS -> "Login with a web browser".
3. Confirm: `gh auth status` shows `repo` among the token scopes.

Repos are created **private** under the logged-in account. Git pushes use Git Credential Manager
(installed with git for Windows/macOS) - no token goes into a remote URL.

## 3. Cloudflare

1. Create a free account: https://dash.cloudflare.com/sign-up
2. **A domain on Cloudflare.** Sites live at `<slug>.<your-domain>`. Either:
   - Add one you own: https://dash.cloudflare.com/?to=/:account/add-site, then set the two
     nameservers Cloudflare shows at your registrar (propagation can take minutes to hours); or
   - Register one: https://dash.cloudflare.com/?to=/:account/domains/register (spends money -
     see `domain-move.md`).
3. **Get the Global API Key** (used once, then discarded):
   https://dash.cloudflare.com/profile/api-tokens -> "API Keys" -> Global API Key -> View.
4. In **your own terminal** (so the key never enters a chat):
   ```bash
   # macOS / Linux
   CF_ACCOUNT_EMAIL=you@example.com CF_GLOBAL_API_KEY=xxxxxxxx \
     node <skill-dir>/scripts/setup-cloudflare.mjs --domain your-domain.com --forward-email you@gmail.com
   ```
   ```powershell
   # Windows PowerShell
   $env:CF_ACCOUNT_EMAIL="you@example.com"; $env:CF_GLOBAL_API_KEY="xxxxxxxx"
   node <skill-dir>\scripts\setup-cloudflare.mjs --domain your-domain.com --forward-email you@gmail.com
   ```
   Or run it with no variables and answer the hidden prompt. It: finds the account that owns the
   domain's zone (never guesses the first of several accounts), mints a **scoped API token**
   (Pages, Workers, D1, DNS, Email Routing, redirects - not "everything"), smoke-tests it,
   stores it, and does **not** store the global key unless you pass `--keep-global-key`.
   Use `--dry-run` first to see exactly which permissions it would grant.
5. **Install the Cloudflare Pages GitHub App** (one click, once - without it Pages cannot read
   your repos): https://github.com/apps/cloudflare-workers-and-pages/installations/new -> choose
   your account -> "All repositories" or select repos.
6. **Email Routing** (only if you want `info@<site>` forwarding): in the dashboard open the
   domain -> Email -> Email Routing -> enable. It adds the MX/SPF records on the apex, which
   `provision-site.mjs` mirrors onto each subdomain. The forward-to address must be verified
   once: Cloudflare emails it a link (the first provisioning run creates the destination and
   tells you).

## 4. Image generation (ChatGPT image skill)

Requires a **ChatGPT subscription** (Plus/Pro). No API key.

```bash
node <skill-dir>/scripts/install-skills.mjs      # installs chatgpt-imagegen + apple-design
npm i -g @openai/codex
codex login                                       # opens a browser: sign in to ChatGPT
```

`doctor` confirms `~/.codex/auth.json` holds a ChatGPT login (an API key does not count).
Source of the skill: https://github.com/leeguooooo/chatgpt-imagegen (manual install:
`npx skills add leeguooooo/chatgpt-imagegen -g`).

The default `--backend codex` is headless and needs only the login above. The skill's
browser-driven `web` backend (via `chrome-use`) is optional and **must not be installed
without the user's say-so**.

## 5. Design skills

- **apple-design** - by Emil Kowalski, MIT-licensed, from `github.com/emilkowalski/skills`;
  `install-skills.mjs` downloads it to `~/.claude/skills/apple-design`. It is fetched, not bundled,
  so the author stays credited.
- **ui-ux-pro-max** (palette, type pairing, style input) - in Claude Code:
  `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`, then
  `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`.

## 6. Google (Analytics 4 + Search Console)

One **service account** does everything over the APIs, so each new site is registered with no
clicking. Two things have no API and are done once by a human: the first access grant in GA, and
(already automated afterwards) domain ownership.

### 6a. Create the service account

**With gcloud** (https://cloud.google.com/sdk/docs/install, then `gcloud auth login`):

```bash
node <skill-dir>/scripts/setup-google.mjs gcloud
```

It creates a Cloud project, enables the Analytics Admin, Search Console and Site Verification
APIs, creates the service account and downloads its key.

**Without gcloud**, by hand (or have Claude drive Chrome through it):

1. New project: https://console.cloud.google.com/projectcreate
2. Enable each API (open the link, click Enable):
   - https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com
   - https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
   - https://console.cloud.google.com/apis/library/siteverification.googleapis.com
3. Service account: https://console.cloud.google.com/iam-admin/serviceaccounts -> Create
   service account -> name `msf-automation` -> Done (no roles needed).
4. Open it -> Keys -> Add key -> Create new key -> JSON. Save the file as
   `~/.marketing-site-factory/google-service-account.json`.
5. If key creation is blocked ("Service account key creation is disabled"), your Google
   Workspace organisation enforces `iam.disableServiceAccountKeyCreation`; a personal
   `@gmail.com` account is not affected. Use a personal account/project, or ask the org admin.

### 6b. Give it access to Analytics (the one manual grant)

1. Have a GA account: https://analytics.google.com/ -> Start measuring (account name only; the
   automation creates the properties).
2. https://analytics.google.com/analytics/web/#/admin -> choose the **account** (not a property)
   -> **Account access management** -> **+** -> **Add users**.
3. Email = the service account address (`setup-google.mjs status` prints it), role
   **Administrator**, untick "Notify new users by email". Save.
4. `node <skill-dir>/scripts/setup-google.mjs detect --timezone America/Mexico_City --currency MXN`
   finds the account and stores the time zone/currency new properties will use.

### 6c. Domain ownership for Search Console (automatic)

`node <skill-dir>/scripts/register-site.mjs --verify-domain` asks Google for a DNS TXT token,
writes it to Cloudflare DNS, and verifies - once per domain. Ownership of a domain property
**cascades to every subdomain**, so sites under your base domain never need verifying again. A
site that later moves to its own domain needs its own `--verify-domain <that-domain>`.

Optional: add the human's own Google account as owner so the dashboards show in their UI
(`webResource.update` with `owners: [<email>]`; the Search Console API has no user-management
endpoint).

## 7. Claude in Chrome

Install the Anthropic extension: https://claude.ai/chrome, sign in, and confirm Claude Code lists
the `claude-in-chrome` tools. It is used for dashboard steps that have no API (Bing import,
creating the Bing API key, viewing GA/GSC). Without it, Claude gives you the link and the clicks
and waits.

## 8. Bing (optional API key)

IndexNow needs no account. For the Bing Webmaster dashboard, see `google-bing.md`.

---

## When the user is stuck

Re-run `doctor.mjs` and fix only the first `[xx]`. Most failures are one of: domain not yet
active on Cloudflare (nameservers not propagated), Pages GitHub App not installed, `codex login`
done with an API key instead of ChatGPT sign-in, or the service account not yet added in GA.
