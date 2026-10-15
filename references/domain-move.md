# Moving a site to its own domain; buying a domain

The `<slug>.<your-domain>` subdomain is deliberately temporary: these sites are pitched to real
businesses, and once one signs it moves to **its own domain and inbox**. Nothing in a site's code
may hardcode your base domain - the hostname and contact details come from `src/config.ts`.

> This skill does **not** ship an automated move script; the steps below are the manual
> procedure, with the traps already found. Each step is a small, idempotent API call you can
> script yourself if you move sites often.

## Buying a domain - this spends the user's money

**Quote the price and get an explicit yes before buying.** Cloudflare Registrar:
https://dash.cloudflare.com/?to=/:account/domains/register (search -> checkout). Report **both**
the first-year price and the renewal price (a promotional first year says nothing about
renewal), and tell the user **auto-renew is off by default** unless they turn it on - the domain
expires on its date otherwise. Privacy and transfer lock default on.

If automating through the API:

- `GET /accounts/{acct}/registrar/domains/{name}/check` returns availability, `premium`,
  `can_register` and `fees` + `promotional_fees` - free and safe.
- `POST /accounts/{acct}/registrar/registrations` with `{ "domain_name": ... }` **registers and
  charges**. **Never discover a request schema by sending plausible-valid bodies to an endpoint
  that can charge**; a test body against a billing endpoint is a purchase. Probe with
  deliberately invalid bodies and send a complete one only when you mean to buy. One 404 is not
  a survey of an API.
- The zone then appears in the same account automatically.

## The move

1. The domain is a zone on the same Cloudflare account (active).
2. Pages project -> Custom domains: add the apex **and** `www`; point DNS at the project's real
   `pages.dev` host (read `project.subdomain`; don't assume).
3. **Redirect `www` -> apex** (or the reverse) with one 301 zone redirect rule that keeps path and
   query - otherwise the same site answers 200 on two hostnames and links/ranking split.
4. Email Routing on the new zone: a catch-all plus an explicit `info@` rule to the client's
   inbox; verify the destination.
5. Update the site: `src/config.ts` (`site.url`, contact email), `astro.config.mjs` (`site`),
   `public/robots.txt` and `public/llms.txt` sitemap/URLs, `SITE.md`. Build, push.
6. **GA4**: patch the existing data stream's `defaultUri` - don't create a new stream (a new
   measurement id splits history). Rename the property to the new hostname.
7. **Search Console**: add the new domain, **verify it by DNS TXT** (`register-site.mjs
   --verify-domain <new-domain>`; ownership of your base domain does not cascade to a different
   domain), submit `sitemap-index.xml`.
8. Re-run `indexnow.mjs`. Decide what the old subdomain does: a `public/_redirects` 301 to the
   new domain, or tear it down (detach domains before deleting the Pages project).
9. Cloudflare Web Analytics: create a token for the new hostname and update `config.ts`.
