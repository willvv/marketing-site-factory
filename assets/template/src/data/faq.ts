/**
 * The FAQ. Rendered as visible text on the FAQ page and the home page, and
 * emitted as FAQPage JSON-LD. Written for answer engines (ChatGPT, Gemini,
 * Perplexity, Google AI answers), which lift ONE answer out of context:
 *
 *   - Ask the question the way a customer would TYPE it, in that language.
 *   - Each answer stands alone: no "as mentioned above".
 *   - Lead with the answer, then qualify.
 *   - Put the specifics in the answer - business name, town, price if supplied,
 *     phone / WhatsApp - because a quote with no contact detail wins nothing.
 *   - Never invent an answer to make a nice FAQ. If a price is unknown, the
 *     honest answer ("it depends on X - message us") is a good answer.
 *   - Plain text only: the same string goes into the JSON-LD verbatim.
 *
 * One list per configured locale (keys match src/i18n/locales.ts).
 */
import type { Lang } from '../i18n/locales';

export interface FaqItem {
  q: string;
  a: string;
}

export const faq: Record<Lang, FaqItem[]> = {
{{faqBlocks}}
};
