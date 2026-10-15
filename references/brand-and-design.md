# Brand and design

## BRAND.md - written before any page

Every site gets one, at the repo root, committed. The template ships a skeleton. It must contain:

- **Positioning line**, audience, tone of voice (3 adjectives + one thing it never sounds
  like), languages.
- **Palette**: every colour with hex, semantic role, and the **verified contrast pairs**
  (WCAG AA: 4.5:1 body text, 3:1 large text and UI components). Compute the ratios; do not
  eyeball them.
- **Type pairing**: heading font, body font, the scale, why they suit *this* business, how they
  load (self-hosted woff2 with preload, or preconnect + `display=swap`; never render-blocking).
- **Logo**: what it is, where the file lives, and whether it is the **real brand asset** or
  generated. A real logo is used as-is and never redrawn; only generate one when the business
  genuinely has none, and say so.
- **Image direction**: the visual language **and the exact prompts used** (so later images
  match - `imagery.md`).
- **Design notes**: how the foundations below are honoured in this brand's terms.
- **Do / don't** specific to this brand.

## Every site must look different

A visitor comparing two sites from this factory must not guess they share a builder. Per site,
decide differently: palette, type pairing, hero shape, card/grid logic, spacing system, section
rhythm, imagery treatment. Do not carry a previous site's hero, card grid or spacing forward.
The template's CSS is deliberately bare for exactly this reason - it supplies structure and
accessibility, not a look.

Run the **ui-ux-pro-max** skill at the start of a design for palette / type / style input. Treat
it as a reference database, not an oracle: take what fits the brief, decide the rest yourself
(it sometimes returns a mismatched style).

## Apple design foundations (the `apple-design` skill is mandatory)

Load and follow the `apple-design` skill when designing and when reviewing. It is distilled from
Apple's WWDC design talks (chiefly *Designing Fluid Interfaces*) for the web. The principles to
apply to a marketing site - *principles, not Apple's visual style*:

| Foundation | What it means on a marketing site |
| --- | --- |
| **Response** | Buttons and links react on pointer-down, not release (`:active` scale/tint, ~100 ms). No artificial delays, no debounce on the input path. |
| **Direct manipulation** | Anything draggable/swipeable (carousel, sheet, gallery) tracks the pointer 1:1 with Pointer Events + `setPointerCapture`, respects the grab offset, and uses release velocity. |
| **Fluid, interruptible motion** | Springs over fixed-duration easing for gestural things; motion starts from the current on-screen value and can be grabbed and reversed. Plain CSS transitions are fine for simple state changes - keep them short. |
| **Restraint** | One idea per screen, generous space, few type sizes, one accent. Motion and translucency exist to explain, never to decorate. |
| **Spatial consistency** | Things leave the way they arrived; a sheet that rises from the bottom dismisses downward. Navigation keeps a stable mental map. |
| **Typography** | Tighten tracking as size grows (about -0.02em at display sizes, ~0 for body); optical sizing where the font supports it; comfortable leading (1.5-1.65 body); 60-70ch measure. |
| **Materials & depth** | `backdrop-filter` only on chrome that content scrolls under, with a solid fallback and a contrast check. |
| **Reduced motion** | Under `prefers-reduced-motion: reduce`, replace slides/springs with cross-fades or nothing. Never remove information. |
| **Feedback** | Status, completion, warning, error. Validate forms inline, not on submit. |
| **Wayfinding** | Every page answers: where am I, where can I go, what is here, how do I leave. Name nav items for their content, not "Home"-style umbrellas. |

Concrete defaults from the skill: default UI spring critically damped (damping 1.0, response
0.3-0.4s); flick/momentum spring slightly under-damped (~0.8); decide reverse-vs-commit on
release by velocity sign, not position.

## Desktop and mobile

- **Mobile-first.** Design the 375 px layout first, then widen. Breakpoints at content need, not
  device names.
- **Touch**: targets >= 44x44 px, spacing between them, no hover-only affordances, sticky CTA
  only if it does not cover content.
- **No horizontal scroll** at any width (`document.documentElement.scrollWidth <= innerWidth`).
- **Core Web Vitals**: no layout shift (explicit `width`/`height` on images, reserved space for
  embeds), no render-blocking fonts, hero image sized and `fetchpriority="high"`, nothing
  oversized. Convert generated PNGs to WebP/AVIF through Astro's image pipeline.
- **Accessibility**: WCAG AA contrast, visible keyboard focus (`:focus-visible`), semantic
  landmarks (`header`, `nav`, `main`, `footer`), labelled inputs, one `<h1>`, skip link, real
  button/link elements.

## Primary CTA

Default to **WhatsApp** where customers there use it (Latin America, much of Europe/Asia),
email as the secondary channel; set `primaryCta` in `src/config.ts`. The number is `null` until
the user supplies a real one - the CTA then falls back to email rather than shipping a made-up
number. Contact details, nav labels and CTA labels are defined once (config + dictionaries) and
referenced everywhere; nothing hardcodes the domain.
