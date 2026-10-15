# {{name}} - site record

The living record of this site. Update it with every significant pass.

## Contacto del negocio
| Campo | Valor | Fuente |
| --- | --- | --- |
| Nombre | {{name}} | cliente |
| WhatsApp | no publicado | |
| Teléfono | no publicado | |
| Correo | {{email}} | infraestructura |
| Dirección | no publicado | |
| Horario | no publicado | |
| Cobertura | no publicado | |
| Idiomas | {{languageNames}} | |

`src/config.ts` is the source of truth the site renders from; this table is the
human-readable copy. Update it whenever `config.ts` changes.

## Infrastructure
| Thing | Value |
| --- | --- |
| URL | {{url}} |
| Repo | {{repo}} (private) |
| Pages project | {{slug}} |
| Deploys | Cloudflare Pages Git integration - push to `main` |
| Contact email | {{email}} |
| GA4 | see `src/config.ts` -> analytics.ga4Id |
| Search Console | property for {{url}}/ ; sitemap {{url}}/sitemap-index.xml |
| Bing | imported from Search Console; IndexNow key file in `public/` |

## Pages
| Page | Purpose |
| --- | --- |
| Home | TODO |
| Services | TODO |
| About | TODO |
| Contact | TODO |
| FAQ | TODO |

## Business facts and sources
| Fact | Value | Source | Needs confirmation |
| --- | --- | --- | --- |
| TODO | | client / web research (URL) | yes/no |

## Placeholder still to replace
- [ ] Copy in `src/i18n/*.ts` (every "TODO")
- [ ] FAQ in `src/data/faq.ts`
- [ ] Real WhatsApp / phone / address / hours in `src/config.ts` (or leave null)
- [ ] Generated imagery (`images.json`) and `public/og-default.png`

## Changelog
- {{date}} - site scaffolded by marketing-site-factory.
