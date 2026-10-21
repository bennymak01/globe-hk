# globe-hk — 香港地球儀專門店

Standalone globe-specialist e-commerce site, spun out of CS Stationery 志成文具 (est. 1984).

**Target:** Hong Kong parents, students, schools and offices buying a *learning* globe.

## Repo layout
```
PROJECT_BRIEF.md          # the design brief Claude Code works from
globe-demo.html           # self-contained one-page demo (visual spec)
scripts/bootstrap.sh      # auth + remote + first push
scripts/sync-catalogue.mjs# catalogue scraper (run by the workflow)
src/content/products/     # one markdown file per globe SKU  (Astro content collection)
public/products/          # product images downloaded by the workflow
```

## Stack
- Astro (static-first) + Cloudflare Pages
- GitHub Actions: `sync-catalogue` (weekly + manual), `deploy` (on push to main)

## Design tokens
| Token | Value | Use |
|---|---|---|
| Navy | `#0B1E33` | hero / footer background |
| Ivory | `#FAF6EE` | page background |
| Amber | `#F2A93B` | primary accent (glowing globe) |
| Teal | `#1E6E8C` | secondary accent, links |
| Ink | `#14202B` | body text |

Fonts: Noto Serif TC (headings) + Noto Sans TC (body).

## Setup (once)
```bash
# 1. Token: https://github.com/settings/tokens/new  → scopes: repo, workflow
printf '%s' "<TOKEN>" | gh auth login --hostname github.com --with-token
gh auth setup-git

# 2. Wire remote and push
bash scripts/bootstrap.sh
```

## Catalogue sync
```bash
gh workflow run sync-catalogue.yml        # manual
gh workflow run sync-catalogue.yml -f limit=10
```
Requires `scripts/sync-catalogue.mjs` (Playwright scraper) — see PROJECT_BRIEF §5.
The source site blocks hotlinking, so images are downloaded and committed into `public/products/`.

## Deploy
Add repo secrets:
- `CLOUDFLARE_API_TOKEN` (Pages deploy token)
- `CLOUDFLARE_ACCOUNT_ID`
