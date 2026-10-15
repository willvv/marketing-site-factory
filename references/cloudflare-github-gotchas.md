# Cloudflare + GitHub facts established by testing

Read this when a provisioning step fails or before adding a Worker. Each item cost real time to
discover.

## Pages, DNS, domains

- **`<project>.pages.dev` is not guaranteed.** The namespace is global across every Cloudflare
  account. If your project name is taken Cloudflare silently gives you a suffixed host
  (`name-5p4.pages.dev`). Pointing a CNAME at the unsuffixed name aims it at a stranger's site:
  error **1014 "CNAME Cross-User Banned"**, while the custom domain sits at `pending` with the
  misleading "CNAME record not set". `provision-site.mjs` reads `project.subdomain` back and
  repoints a wrong CNAME. **Diagnosis shortcut**: a new site 403s on its custom domain -> `curl`
  the pages.dev host and see whose site comes back before touching DNS or proxy settings.
- **The Cloudflare Pages GitHub App must be installed** on the GitHub account. Creating a Pages
  project with `source.type: "github"` needs the numeric `repo_id` and `owner_id`. Without the
  app the create call fails; install it at
  https://github.com/apps/cloudflare-workers-and-pages/installations/new .
- **Deploys are Git integration only - never GitHub Actions.** Push to `main` -> build -> deploy.
  Build config: `npm run build`, output `dist`.
- **Detach custom domains before deleting a Pages project** (error 8000028 otherwise).
- A hostname attaches to one Pages project at a time; `provision-site.mjs` surfaces the conflict
  instead of aborting.

## Email Routing

- Works on subdomains, but the dashboard's "Subdomains" toggle has no public API. Copying the
  apex's MX records and an SPF TXT onto the subdomain, then creating a normal rule for
  `info@<sub>.<domain>`, works - `provision-site.mjs` does this.
- A routing rule **cannot be created while its destination address is unverified** (error 2054).
  The destination is verified by clicking the link Cloudflare emails; re-run provisioning after.
- **Prefer a plain verified address as the destination.** A `+suffix` alias is a *different*
  destination that needs its own verification click. Use `--email-alias` only when mail must be
  separated.
- Catch-all is **one per zone** (set on the apex); matchers support only `literal` and `all`, so
  each site gets an explicit `info@` rule. Whether the zone catch-all also catches subdomain mail
  is not verified - send a test before relying on it.
- Sending: the Workers `send_email` binding reports `email sending not authorized for subdomain
  '<zone>'` when the **recipient** isn't a verified destination - check the recipient first, not
  the sender domain.

## Scoped API tokens

`setup-cloudflare.mjs` mints a token from permission groups resolved *by name* (Cloudflare has
renamed groups before; unresolved names are reported, not silently dropped). Account groups:
Account Settings Read, Pages Write, Workers Scripts Write, D1 Write, Email Routing Addresses
Read/Write. Zone groups (all zones): Zone Read, DNS Write, Email Routing Rules Write, Workers
Routes Write, Dynamic URL Redirects Write, Zone Settings Read. User: User Details Read,
Memberships Read.

Things a scoped token may not cover - re-run setup with `--keep-global-key`, or do them in the
dashboard: **Registrar purchases**, creating **Workers Builds build tokens** (UI/global key only;
reuse an existing account-wide one), zone-level features outside the list above.

## Workers (anything needing server-side processing)

A static site plus a small Worker is the pattern. Do **not** add SSR to the Astro build and do
**not** use a third-party form service.

- Lives in `workers/<name>/` inside the site repo with its own `wrangler.toml`; deploy with
  `npx wrangler deploy --config workers/<name>/wrangler.toml`.
- **wrangler v4 requires Node >= 22** and refuses to run on 20.
- **Secrets** go through `wrangler secret put`, Pages build variables through the dashboard/API
  - never the repo.
- **The native `[[ratelimits]]` binding validates and deploys but does not enforce** (100
  requests against a 30/60s cap, all accepted). Use a **Durable Object** counter - fixed window,
  in-memory - for real rate limiting.
- **`workers_dev = false`** for anything behind Cloudflare Access: Access attaches to the
  hostname, and `<worker>.<subdomain>.workers.dev` is a different, ungated hostname.
- A `custom_domain` route is a *zone* resource: a token with only account-level Workers/D1
  permissions uploads the script, then fails on the last step with `Authentication error
  [code: 10000]`. It needs **Workers Routes Write** on the zone.
- **Workers Builds is scriptable** (Git-connected Worker deploys with no GitHub Actions):
  `PUT /accounts/{id}/builds/repos/connections`, then `POST /accounts/{id}/builds/triggers`
  with **all** of `external_script_id` (the *script tag*, from
  `GET /workers/services/{name}` -> `default_environment.script_tag`), `repo_connection_uuid`,
  `build_token_uuid`, `trigger_name`, `build_command`, `deploy_command`, `root_directory`,
  `branch_includes`, `branch_excludes`, `path_includes`, `path_excludes` - any subset returns the
  unhelpful `12002: Invalid request body`. Build history terminal state is `status: "stopped"` with
  `build_outcome: "success"`. For a D1-backed Worker the deploy command is
  `npx wrangler d1 migrations apply <db> --remote && npx wrangler deploy`.

## GitHub

- `gh auth login` keyring tokens carry `repo` + `workflow`; a fine-grained PAT may lack
  "Secrets" permission (403 on `gh secret`). If you pass a secret value to `gh`, put it on
  **stdin, never argv** - an error message prints the whole command line.
- Branch is `main`, not `master`.
- Repos are **private** by configuration; treat a leaked key in history as a rotate-the-key
  incident, not a rebase.

## Astro gotchas

- The content layer caches deleted entries in `node_modules/.astro/data-store.json`;
  `rm -rf node_modules/.astro dist` before trusting a content change locally.
- Passing `class:list` to a *component* does nothing - it's an element-only directive. Forward a
  plain `class` string prop.
- **A class passed into a component cannot be targeted by the parent's scoped `<style>`** (the
  element carries the child's `data-astro-cid`). Wrap the child in an element the parent owns, or
  use `:global()`.
- **An unlayered `<style is:global>` beats every Tailwind utility.** Tailwind v4 puts utilities
  in `@layer`; any unlayered rule outranks them. A bare `img { height: auto }` silently kills
  `h-14` etc. Don't restate preflight; if a global override is needed put it in `@layer base`.
- The sitemap integration needs `site` set to the production URL, or it emits nothing.
