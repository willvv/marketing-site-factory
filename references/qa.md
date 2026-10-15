# QA - before declaring a site done

Mechanical checks first (they are cheap and exact), then eyes.

## 1. Mechanical

```bash
npm run build                                   # must pass: astro check + astro build
node <skill-dir>/scripts/check-site.mjs . --strict
```

`check-site` enforces: `<html lang>`, unique title + description, canonical matches the page,
OG/Twitter set, exactly one `<h1>` and no skipped levels, `alt` on every image, `width`/`height`
present, JSON-LD parses, `FAQPage` present, hreflang complete + targets built + `x-default`,
no emoji, no leftover `TODO`, sitemap/robots/llms/IndexNow key present, AI crawlers named,
`og-default.png` is exactly 1200x630, favicon files exist, analytics tags present.

Fix every error. Warnings are judgement calls - `--strict` makes them blockers; resolve each
or consciously accept it (and note it in `SITE.md`).

## 2. Responsive - look at it at three widths

Take screenshots with whichever browser tool is available (Playwright MCP, Claude in Chrome,
or `npx playwright screenshot`) of **home, the longest content page, contact and the FAQ** at:

| Width | Represents |
| --- | --- |
| 375 x 812 | small phone |
| 768 x 1024 | tablet / large phone landscape |
| 1440 x 900 | laptop / desktop |

For each, confirm:

- No horizontal scroll: `document.documentElement.scrollWidth <= window.innerWidth`.
- Nothing overlaps or truncates; text never touches the screen edge (>= 16 px gutter).
- Tap targets >= 44x44 px with space between; the mobile menu opens, closes and is reachable.
- The primary CTA is visible without scrolling on the home page at 375 px.
- Images are sharp but not oversized; hero doesn't push the CTA below the fold on mobile.
- Language switcher (if bilingual) works on both widths and lands on the same page.
- Dark text on light, light on dark: no low-contrast pairs, including text over images.
- Keyboard: Tab order is logical, focus ring visible, skip link works.
- `prefers-reduced-motion`: motion is replaced, not just slowed.

Screenshots are for **review only**. They are never used as site images (imagery.md).

## 3. Look at the generated images

Open each generated image and the share card. Check spelling, that the logo did not drift, that
nothing that reads as a factual claim (a fake rating badge, a made-up award) crept in, and that
the set is stylistically consistent.

## 4. Content integrity pass

Search the built site for anything that reads as a fact: prices, phone numbers, addresses,
hours, counts ("500+ customers"), years ("since 1998"), names, awards, testimonials. Each must
trace to the user or a recorded public source in `SITE.md`. Anything else is removed or becomes
a visible `TODO` - never shipped as real.

## 5. After the deploy

- `curl -I https://<host>/` -> 200, correct cert; `https://<host>/sitemap-index.xml`,
  `/robots.txt`, `/llms.txt`, `/<indexnow-key>.txt` all 200.
- GA4 Realtime shows your own visit; Cloudflare Web Analytics shows it within minutes.
- Search Console: sitemap status "Success"; paste the home URL into URL Inspection ->
  "Request indexing".
- `node <skill-dir>/scripts/indexnow.mjs <slug>` returned 200/202.
- Send a message to `info@<host>` and confirm it arrives (Email Routing).
- Share the URL in a chat app and look at the link preview (OG card).
