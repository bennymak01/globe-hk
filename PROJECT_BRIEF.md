# PROJECT BRIEF — Globe.hk 專賣學習地球儀網站

## 1. Project Overview
**Goal:** Spin off a standalone, Globe-specialist e-commerce/content website out of CS Stationery's (志成文具) existing globe (地球儀) catalogue. Target: Hong Kong parents, students, teachers, offices — buy a learning globe, not browse general stationery.

**Positioning:** 「香港地球儀專門店」— HK's globe specialty store. Est. 1984 heritage of CS Stationery (Mong Kok) lends trust; the new site is globe-first: education + decor + AR smart globes.

**Proposed domain:** globe.hk (if available) / globehk.com / csstationery-globe.com — confirm availability.

**Language:** Traditional Chinese (zh-HK) primary, with bilingual product titles (中英文 globe labels sell the bilingual benefit). Consider `/en/` later.

## 2. Stack & Deployment (per Benny's usual workflow)
- **Astro** (static-first, v5) + minimal islands; no heavy framework needed
- Products: Astro Content Collections, one markdown file per SKU (`src/content/products/*.md`) with frontmatter schema:
  `name, nameEn, sku, priceHKD, size_cm, language (中文/English/中英), series (教育/AR智能/木質/燈光/辦公擺設), stock, images[], features[], description, related[]`
- Hosting: **Cloudflare Pages**, GitHub repo, **GitHub Actions** CI (build + deploy)
- Cart/checkout Phase 1: WhatsApp order links + 填單 form (cheapest, matches CS Stationery habits); Phase 2: WooCommerce or Snipcart if needed
- SEO: zh-HK meta, schema.org `Product` + `Offer` JSON-LD, sitemap, OG images; internal links back to csstationery.com for authority flow

## 3. Colour Tone & Style (recommended)
**Direction: 「夜燈地球儀」 (Glowing Desk Globe) — warm educational, not toy-like.**
- Background: deep space navy `#0B1E33` (hero) → paper ivory `#FAF6EE` (content) — dark/light split
- Accent: **glow amber `#F2A93B`** (like a lit globe's warm light) + **ocean teal `#1E6E8C`**
- Neutrals: ink `#14202B`, muted text `#5A6B78`
- Font: Noto Sans TC (zh) + a humanist serif for headings (e.g. "思源宋體/Noto Serif TC") = heritage stationery feel
- Mood: clean, warm, trustworthy, "親子學習" friendly. Avoid childish bright primary colours; avoid cold tech-blue SaaS look.

## 4. Demo Page (attached, `globe-demo.html`)
A self-contained one-page mock implementing the above: hero with animated CSS globe (slow rotation, glow), product grid with **smooth hover animations** (lift + shadow bloom + image zoom + label slide-up), category tabs, trust strip (1984 heritage, 旺角實店, 全港送貨), CTA to WhatsApp. Claude Code: use it as the visual spec — port it into Astro components.

## 5. Product Catalogue Migration
Source: csstationery.com / csstationery.hk globe SKUs. **Site blocks image hotlinking/scraping** — use a **GitHub Action** (scheduled) or **Apify actor** with residential/browser context to pull product data + download images to repo `public/products/`. Suggested Apify: Web Scraper actor, proxy residential, download images via REST and commit via GITHUB_TOKEN.
Known series from existing catalogue:
- 智能AR互動款 (AR 發光地球儀, USB 充電, ~23cm, 14 AR 科學主題)
- 教育學習款 (8"/12", 中英文 / 繁體中文 political globes)
- 燈光擺設款 (發光, 木質/金屬底座)
- Office/擺設款
Each migrated product keeps: bilingual title, size, price HKD, language version, 底座 material, features.

## 6. Site Map (Phase 1)
```
/            首頁: hero + 4 series + bestsellers + 關於志成 + 選購指南 CTA
/products/   全部地球儀 (filter: 尺寸/語言/系列/價錢)
/products/[slug]
/guides/     內容 SEO: 如何揀地球儀 (尺寸指南, 中英 vs 純中, AR 值唔值, 送禮推介)
/about/      志成文具 1984 故事 + 門市資訊
/contact/    WhatsApp + 門市地址 + 訂購表單
```
Content SEO angle (Benny's usual): blog posts targeting 「地球儀 香港邊度買」「兒童地球儀推薦」「地球儀 中英文 分別」with dates + internal links.

## 7. Hover/Interaction Spec (the "show off" part)
- Hero globe: CSS 3D slow-spin, glow pulse; mouse parallax tilt (transform: rotateX/Y, lerp ~0.08)
- Product cards: `translateY(-8px)` + shadow bloom + image `scale(1.06)` + feature tags slide up, 300–400ms cubic-bezier(0.22,1,0.36,1)
- Category tabs: animated underline slide
- Buttons: gradient sweep on hover
- Respect `prefers-reduced-motion`

## 8. Open Questions (answer when awake)
1. Domain choice? globe.hk available?
2. Phase 1 checkout: WhatsApp order OK, or want online payment now?
3. Prices display: online prices or "門市查詢"?
4. Which globe SKUs are the hero products / in stock?
5. Keep bilingual (en) version later?

## 9. Milestones
- M1: Brief approved → Claude Code scaffolds Astro repo + tokens + demo port
- M2: Catalogue scraper (GitHub Action/Apify) pulls SKUs + images into repo
- M3: Product pages + filters + SEO schema done
- M4: Guides content ×3, OG images, deploy to Cloudflare Pages
- M5: Submit sitemap, internal links from csstationery.com
