#!/usr/bin/env node
/**
 * sync-catalogue.mjs — pull the 地球儀 / globe catalogue from CS Stationery
 * into Astro content-collection markdown + download product images.
 *
 * Run by .github/workflows/sync-catalogue.yml (weekly + manual).
 *
 * Why Playwright instead of fetch(): csstationery.com/hk sit behind hotlink
 * and bot protection; plain HTTP requests get blocked or served a stub page.
 *
 * Usage:
 *   node scripts/sync-catalogue.mjs
 *   LIMIT=10 node scripts/sync-catalogue.mjs
 *
 * Env:
 *   SOURCE_URL   listing page to crawl        (default: csstationery.com category)
 *   FALLBACK_URL second source                (default: csstationery.hk)
 *   LIMIT        max products per run, 0 = all
 *   OUT_DIR      where product images land     (default: public/products)
 *   CONTENT_DIR  where product markdown lands  (default: src/content/products)
 */

import { chromium } from 'playwright';
import { writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE_URL = process.env.SOURCE_URL || 'https://csstationery.com/world-globe/';
const FALLBACK_URL = process.env.FALLBACK_URL || 'https://csstationery.hk';
const LIMIT = Number(process.env.LIMIT || 0) || Infinity;
const OUT_DIR = process.env.OUT_DIR || 'public/products';
const CONTENT_DIR = process.env.CONTENT_DIR || 'src/content/products';

/* ---------------------------------------------------------------- helpers */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Extract a price in HKD from noisy product-page text. */
function parsePrice(text) {
  if (!text) return null;
  const m = String(text).match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** Pull "12吋" / "23cm" / "8 inch" style dimensions out of a title. */
function parseSize(text) {
  if (!text) return null;
  const cm = String(text).match(/(\d{1,2}(?:\.\d)?)\s*(?:cm|CM|厘米)/);
  if (cm) return `${cm[1]} cm`;
  const inch = String(text).match(/(\d{1,2}(?:\.\d)?)\s*(?:吋|"|inch|英寸)/);
  if (inch) return `${inch[1]} 吋`;
  return null;
}

/** Decide which series a product belongs to, from its title. */
function classify(title = '') {
  const t = title.toLowerCase();
  if (/ar\s*智能|ar互動|ar互動|augmented/.test(t) || /智能/.test(title)) return 'ar';
  if (/發光|燈光|夜燈|led/.test(t)) return 'lamp';
  if (/木製|木質|實木/.test(t)) return 'wood';
  if (/擺設|裝飾|办公|辦公/.test(t)) return 'decor';
  return 'education';
}

/** Which language the globe labels are printed in. */
function detectLanguage(title = '', body = '') {
  const hay = `${title} ${body}`;
  if (/中英|雙語|bilingual|中英文/.test(hay)) return 'both';
  if (/繁體|繁中|zh-hant|traditional/.test(hay)) return 'zh-Hant';
  if (/英文|english/i.test(hay)) return 'en';
  return 'unknown';
}

/** Turn arbitrary text into a filesystem/url-safe slug, keeping Chinese. */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Escape a string for use inside YAML frontmatter double quotes. */
function yamlEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function yamlList(items) {
  return items.map((i) => `  - "${yamlEscape(i)}"`).join('\n');
}

/* ------------------------------------------------------------------ crawl */

/**
 * Scrape a listing page for product links.
 * WooCommerce stores use .woocommerce-loop-product__title a; csstationery.com
 * is WooCommerce-based, so we target that and fall back to any <a> that looks
 * like a product permalink.
 */
async function collectProductLinks(page) {
  const links = await page.$$eval('a', (as) =>
    as.map((a) => ({
      href: a.href,
      text: (a.textContent || '').trim(),
      cls: a.className || '',
    }))
  );

  const productish = links.filter(
    (l) =>
      l.href &&
      /csstationery\.(com|hk)/.test(l.href) &&
      l.text.length > 3 &&
      (/\/product\//.test(l.href) ||
        /product|globe|地球儀/i.test(l.cls) ||
        /product/.test(l.href))
  );

  const seen = new Set();
  return productish.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
}

/** Scrape one product page for its data. */
async function scrapeProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const t = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
    const meta = (name) =>
      document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || '';

    // WooCommerce summary / custom fields
    const summary = t('.woocommerce-product-details__short_description') ||
      t('#description') || t('.product_description');

    // Gallery images: WooCommerce data attributes + <img> fallbacks
    const imgs = new Set();
    document.querySelectorAll('.woocommerce-product-gallery img, .product-gallery img').forEach((img) => {
      const src = img.getAttribute('data-large_image') || img.getAttribute('data-src') || img.src;
      if (src && !src.includes('placeholder')) imgs.add(src);
    });
    document.querySelectorAll('.summary img, .product img').forEach((img) => {
      if (img.src && !img.src.includes('placeholder')) imgs.add(img.src);
    });
    if (meta('og:image')) imgs.add(meta('og:image'));

    // Price
    const priceText =
      t('.woocommerce-Price-amount') || t('.price') || meta('product:price:amount');

    // Stock / SKU
    const sku = t('.sku_wrapper .sku') || t('.product_meta .sku') || '';
    const stockText = t('.stock') || '';

    // Feature bullets
    const features = [...document.querySelectorAll(
      '.woocommerce-product-details__short_description li, .product_meta li, #description li'
    )].map((li) => li.textContent.trim()).filter(Boolean).slice(0, 12);

    return {
      title: t('.product_title') || t('h1') || meta('og:title'),
      priceText,
      summary,
      sku,
      stockText,
      features,
      images: [...imgs],
    };
  });

  return { url, ...data };
}

/* ------------------------------------------------------------------- main */

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CONTENT_DIR, { recursive: true });

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-HK',
  });

  const page = await ctx.newPage();

  console.log(`→ loading ${SOURCE_URL}`);
  await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  let links = await collectProductLinks(page);

  if (!links.length) {
    console.log(`→ no links on primary source, falling back to ${FALLBACK_URL}`);
    await page.goto(FALLBACK_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    links = await collectProductLinks(page);
  }

  if (!links.length) {
    console.error('✗ No product links found. The selector strategy needs updating.');
    await browser.close();
    process.exit(1);
  }

  console.log(`→ found ${links.length} product links`);

  const products = [];
  const seenSkus = new Set();

  for (const link of links) {
    if (products.length >= LIMIT) break;
    try {
      const p = await scrapeProduct(page, link.href);
      if (!p.title || p.title.length < 3) continue;
      if (seenSkus.has(p.sku || p.url)) continue;
      seenSkus.add(p.sku || p.url);
      products.push(p);
      console.log(`  ✓ ${p.title.slice(0, 60)}`);
    } catch (err) {
      console.warn(`  ✗ ${link.href} — ${err.message}`);
    }
  }

  await browser.close();

  console.log(`→ writing ${products.length} products`);

  for (const p of products) {
    const slug = slugify(p.title) || `globe-${Date.now()}`;
    const price = parsePrice(p.priceText);
    const size = parseSize(p.title) || parseSize(p.summary);
    const series = classify(`${p.title} ${p.summary}`);
    const language = detectLanguage(p.title, p.summary);
    const inStock = p.stockText ? !/out of stock|缺貨|售罄/i.test(p.stockText) : true;

    // Download images
    const localImages = [];
    let imgIdx = 0;
    for (const src of p.images.slice(0, 6)) {
      const ext = (src.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
      const safeExt = /^(jpg|jpeg|png|webp|avif)$/.test(ext) ? ext : 'jpg';
      const filename = `${slug}-${++imgIdx}.${safeExt}`;
      const dest = path.join(OUT_DIR, filename);
      try {
        const res = await ctx.request.get(src, { headers: { 'User-Agent': UA, Referer: p.url } });
        if (res.ok()) {
          const buf = await res.body();
          await writeFile(dest, buf);
          localImages.push(`/products/${filename}`);
        }
      } catch (err) {
        console.warn(`  ! image failed ${src} — ${err.message}`);
      }
    }

    const frontmatter = [
      '---',
      `name: "${yamlEscape(p.title)}"`,
      `nameEn: "${yamlEscape(p.title)}"`,
      `slug: "${slug}"`,
      `sku: "${yamlEscape(p.sku || slug)}"`,
      `priceHKD: ${price ?? 'null'}`,
      `size: "${yamlEscape(size || '')}"`,
      `language: "${language}"`,
      `series: "${series}"`,
      `inStock: ${inStock}`,
      `sourceUrl: "${p.url}"`,
      'images:',
      localImages.map((i) => `  - "${i}"`).join('\n'),
      'features:',
      yamlList(p.features),
      '---',
      '',
      p.summary ? p.summary.replace(/\s+/g, ' ').trim() : '',
      '',
    ].join('\n');

    await writeFile(path.join(CONTENT_DIR, `${slug}.md`), frontmatter, 'utf8');
  }

  console.log(`✓ done — ${products.length} products in ${CONTENT_DIR}, images in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
