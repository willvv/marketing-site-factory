---
name: marketing-site-factory
description: Build, deploy and register a complete marketing website for a business from scratch - private GitHub repo, Cloudflare Pages (push-to-deploy) and optional Workers, DNS and email forwarding, brand sheet, model-generated imagery and icons (never emoji), SEO + answer-engine/LLM optimisation, Google Analytics 4, Search Console, Bing/IndexNow, optional English/Spanish bilingual, Apple-design-grade UI that works on desktop and mobile. Includes a first-run onboarding that installs and verifies every prerequisite (gh CLI, Cloudflare token, ChatGPT image skill, Google service account, Chrome extension). Use when asked to create, launch or set up a website, landing page or marketing site for a business, or to onboard this workflow.
---

# marketing-site-factory

A repeatable factory for small-business marketing sites. One business idea in, a live,
indexed, analytics-wired site out - on infrastructure the user owns.

`<skill-dir>` below means the folder containing this SKILL.md. Scripts are dependency-free
Node (>= 18) `.mjs` files in `<skill-dir>/scripts/`.

## Working style

- **Work unattended.** The user is often away. Choose the recommended default, keep going,
  and report the decisions at the end. Stop only when every assumption would produce work
  that must be thrown away. Batch questions to the end of a session.
- **Never invent facts about a business.** See "Content integrity" - it overrides copywriting
  instinct.
- **Secrets never enter the chat.** Never ask the user to paste a Cloudflare key, token or
  password into the conversation. Give them the link and the command to run in their own
  terminal (the user can type `! <command>` here to run it inside this session).

## Step 0 - First run: onboarding (do this once per machine)

```bash
node <skill-dir>/scripts/doctor.mjs
```

It is read-only and prints, for every gap, the exact fix and link. **If anything marked
`[xx]` is missing, stop and run onboarding** - read `references/onboarding.md` and walk the
user through it in order. Summary of what it establishes:

| # | Prerequisite | How it is satisfied |
| --- | --- | --- |
| 1 | Node 18+, git, npm | install links in doctor output |
| 2 | **GitHub CLI**, logged in | `gh auth login` |
| 3 | **Cloudflare** account + a domain on it | user creates the account; `setup-cloudflare.mjs` trades their Global API Key for a **scoped token** (the key is then discarded) |
| 4 | Cloudflare Pages GitHub App | one click: https://github.com/apps/cloudflare-workers-and-pages/installations/new |
| 5 | **chatgpt-imagegen** skill + `codex login` | `node scripts/install-skills.mjs`, then the ChatGPT sign-in |
| 6 | **apple-design** skill | from `emilkowalski/skills` (MIT); `install-skills.mjs` downloads it |
| 7 | **ui-ux-pro-max** plugin (palette/type input) | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` |
| 8 | **Google** service account + GA4 account | `setup-google.mjs gcloud` (or manual links) + one GA UI grant |
| 9 | **Claude in Chrome** extension | https://claude.ai/chrome - used to drive dashboards that have no API |
| 10 | Bing Webmaster (optional API key) | IndexNow works without it; see `references/google-bing.md` |

When a step needs a website (sign-in, "click Verify", create an API key), **give the user the
exact URL and the exact clicks**. If the Claude in Chrome tools are available, offer to drive
the browser for them for anything that does not need their password or 2FA.

## Step 1 - Intake (keep it small)

Minimum: a business name and a line about what it does. Infer the rest.

- **Slug:** kebab-case from the name. It becomes the subdomain, repo and Pages project.
- **Languages:** match the market. Ask once, at the end of intake, whether they also want a
  second language (English/Spanish): if yes pass `--langs <default>,<second>`.
- **Existing business?** Spend a few minutes researching its real logo, colours, services,
  phone, address, hours and socials. Record each source in `SITE.md` and flag anything the
  user must confirm. Never guess a phone number.
- **Ask only when** the idea is too vague to write honest copy from.

## Step 2 - Build, in this order

Full commands and rationale: `references/workflow.md`.

1. `node <skill-dir>/scripts/provision-site.mjs <slug>` - private repo, Pages project wired to
   Git, DNS, custom domain, email forwarding, Web Analytics. Idempotent; re-run to recover.
2. `node <skill-dir>/scripts/new-site.mjs <slug> --name "<Name>" --langs <xx[,yy]>` - copies
   the Astro template with SEO, FAQ, i18n, analytics and robots/llms/IndexNow already in place.
3. **Write `BRAND.md` first** (`references/brand-and-design.md`). Palette, type, voice, image
   direction. Run the `ui-ux-pro-max` skill for palette/type input and the **`apple-design`
   skill** for the interaction and typography foundations. Decide before coding.
4. **Generate the brand imagery and icons** with the image skill (`references/imagery.md`) so
   real assets exist before layout work.
5. Build pages on **feature branches**, merge `--no-ff` into `main` only when
   `npm run build` passes (`main` deploys on every push). Replace every `TODO`.
6. `node <skill-dir>/scripts/register-site.mjs <slug>` - GA4 property + stream, Search Console
   property + sitemap; writes the measurement id into `src/config.ts`. Commit it.
7. `node <skill-dir>/scripts/check-site.mjs <site-dir> --strict` after `npm run build`.
8. Push, wait for the deploy, then `node <skill-dir>/scripts/indexnow.mjs <slug>` (Bing,
   Copilot, ChatGPT search, Yandex) and do the one-time Bing import (`references/google-bing.md`).
9. Fill `SITE.md` (including the **Contacto del negocio** table). Report.

## Non-negotiable rules

### Content integrity
No invented testimonials, review counts, star ratings, "trusted by N", team members, stats or
press. Prices, phones, addresses and hours come only from the user or a verified public source
(recorded in `SITE.md`, flagged for confirmation). A real supplied logo is used as-is, never
redrawn. Unknown detail -> `null` / "no publicado" / a `TODO` that `check-site` will flag.

### Images and icons - always the image model, never code, never emoji
- **Every** image - logo, hero, icons, share/OG card, mockups, text-in-image - is produced by
  the image model through the **chatgpt-imagegen** CLI (`scripts/gen-images.mjs`). Do **not**
  build images in HTML/SVG/canvas and screenshot them, and do **not** generate a background and
  overlay text/logo in code. Fix wrong words or a drifting logo **by prompting**: quote the exact
  text, pass the real logo with `refs`, regenerate.
- **No emoji, ever** - not as icons, bullets or decoration. Icons are a generated set in the
  brand palette with one shared style prompt (`references/imagery.md`). Only tiny functional UI
  glyphs (menu/close/chevron) may be CSS or inline SVG in `currentColor`.
- Mechanical resizing of a generated image (crop to 1200x630, favicon sizes) via
  `npm run images:fit` is fine; drawing is not.

### Design
- **Follow the `apple-design` skill**: respond on press, 1:1 direct manipulation, interruptible
  spring motion, restraint, optical type sizing and tracking, translucent materials only where
  they earn their keep, `prefers-reduced-motion` honoured. Apply the *principles*; do not copy
  Apple's look - **every site must look genuinely different** (palette, type, layout logic,
  section rhythm). Details: `references/brand-and-design.md`.
- **Desktop and mobile are both first-class.** Mobile-first; verify at 375, 768 and 1440 px
  with screenshots; no horizontal scroll; tap targets >= 44 px; no layout shift; WCAG AA.
  Procedure: `references/qa.md`.

### Findability (ships with every site, never a later pass)
Unique title + description per page, canonical, Open Graph + Twitter with a real 1200x630
`og:image` (model-generated), one `<h1>`, alt + width/height on images, sitemap, robots that
explicitly allows AI crawlers, `llms.txt`, JSON-LD (business entity, WebSite, BreadcrumbList,
FAQPage), a real customer-voice FAQ written to be quoted, Cloudflare Web Analytics + GA4,
Search Console, Bing via import + IndexNow. Details: `references/seo-aeo.md`.

### Bilingual (optional, English/Spanish or any pair)
Default language unprefixed, others under `/<code>/`, **translated slugs**, hreflang pairs +
`x-default`, language switcher that lands on the same page, per-language FAQ/`llms.txt`,
no automatic redirect by browser language. Details: `references/i18n.md`.

### Git and secrets
Every site is its own **private** repo. Cloudflare Pages **Git integration**, never GitHub
Actions. Feature branches -> `--no-ff` merge to `main`. No `node_modules`, `dist`, `.env` or any
credential committed. Anything needing server-side work is a **Cloudflare Worker** in
`workers/` with its own `wrangler.toml` (`references/cloudflare-github-gotchas.md`).

## Reporting

End every session with: what was built and where (URLs, repo), the decisions you made on the
user's behalf, anything assumed, and what still needs real content from them (WhatsApp number,
address, hours, photos, real testimonials). Batch open questions here.

## Reference index

| File | Read when |
| --- | --- |
| `references/onboarding.md` | doctor reports a gap; first run |
| `references/workflow.md` | building a site end to end |
| `references/brand-and-design.md` | writing BRAND.md, designing, apple-design, uniqueness |
| `references/imagery.md` | generating any image, icon, logo or OG card |
| `references/seo-aeo.md` | SEO, FAQ, llms.txt, schema, robots |
| `references/i18n.md` | adding a second language |
| `references/google-bing.md` | GA4, Search Console, Bing, IndexNow, dashboard clicks |
| `references/cloudflare-github-gotchas.md` | any infra error; Workers; email routing |
| `references/qa.md` | before declaring a site done |
| `references/domain-move.md` | moving to the client's own domain; buying a domain (spends money) |
