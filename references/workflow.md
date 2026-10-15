# Building a site, end to end

All commands run from your workspace folder (the one that will contain `sites/`). Set it once
so scripts find your sites: add `"workspace": "<absolute path>"` to
`~/.marketing-site-factory/config.json`.

## 1. Provision the infrastructure first

```bash
node <skill-dir>/scripts/provision-site.mjs <slug> --dry-run   # read-only plan
node <skill-dir>/scripts/provision-site.mjs <slug>
```

Creates (each step checks first, so re-running is the recovery path): private GitHub repo ->
Cloudflare Pages project on the Git integration (push to `main` deploys; **no GitHub Actions**)
-> DNS CNAME to the project's *real* `pages.dev` host -> custom domain -> Email Routing
(`info@<slug>.<domain>`) -> Cloudflare Web Analytics token. Everything is recorded in
`~/.marketing-site-factory/sites.json`.

Flags: `--pages-only` (no domain yet; lives on pages.dev), `--apex` (use the base domain
itself), `--no-email`, `--email-alias` (forward to `you+<slug>@...` instead of `you@...`).

The domain starts resolving while you build; the first deploy happens on the first push.

## 2. Scaffold the code

```bash
node <skill-dir>/scripts/new-site.mjs <slug> --name "Business Name" --langs es,en
cd sites/<slug>
npm install
```

Gives you: Astro (static) + Tailwind v4, one catch-all route that renders every page in every
locale, `src/config.ts` (single source of contact details / domain / analytics), dictionaries
per language, FAQ data, SEO/JSON-LD/Analytics components, `robots.txt` with explicit AI-crawler
allows, `llms.txt`, the IndexNow key file, `BRAND.md` + `SITE.md` skeletons, and `images.json`.

Commit the scaffold to `main` as the first commit, then branch for each chunk of work.

## 3. BRAND.md before code

See `brand-and-design.md`. Palette (hex + role + verified contrast), type pairing, voice, logo
status, image direction, do/don't. Then put the *same* palette into `src/styles/global.css`
`@theme` tokens.

## 4. Imagery and icons

See `imagery.md`. Fill `images.json` from BRAND.md, then
`node <skill-dir>/scripts/gen-images.mjs images.json`, then `npm run images:fit`.

## 5. Pages on feature branches

```bash
git switch -c feat/brand-and-layout
# ...work... npm run build must pass
git switch main && git merge --no-ff feat/brand-and-layout && git push
```

`main` deploys on every push, so it must always build. Typical branches:
`feat/brand-and-layout`, `feat/home`, `feat/services`, `feat/faq`, `feat/contact-whatsapp`.

Replace every `TODO` (`check-site.mjs` lists them). Write the FAQ in
`src/data/faq.ts` for every locale (`seo-aeo.md`).

Anything needing server-side processing (a contact form that sends email, a booking endpoint)
is a **Cloudflare Worker** in `workers/<name>/` with its own `wrangler.toml` - not SSR in Astro,
not a third-party form service. See `cloudflare-github-gotchas.md`.

## 6. Register with Google

```bash
node <skill-dir>/scripts/register-site.mjs <slug>
```

GA4 property + web stream; writes `analytics.ga4Id` into `src/config.ts` (commit and push it so
the tag ships); adds the Search Console property and submits `sitemap-index.xml`. Needs the
one-time `--verify-domain` for the base domain (`onboarding.md` 6c).

## 7. Verify

```bash
npm run build
node <skill-dir>/scripts/check-site.mjs . --strict
```

Then the visual pass in `qa.md` (375 / 768 / 1440 px).

## 8. Get indexed

After the deploy is live:

```bash
node <skill-dir>/scripts/indexnow.mjs <slug>
```

and do the one-time Bing import (`google-bing.md`). Google already has the sitemap from step 6.

## 9. Document and report

Fill `SITE.md` - especially the **Contacto del negocio** table with every channel the business
really has (write "no publicado" rather than dropping a row), the sources for every business fact,
and what is still placeholder. Report decisions and open questions to the user.

## Re-running after a content change

`npm run build` -> `check-site` -> push -> `indexnow.mjs <slug>`.
