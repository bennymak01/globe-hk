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

const SOURCE_URL = process.env.SOURCE_URL || 'https://csstationery.com/world-globe';
const FALLBACK_URL = process.env.FALLBACK_URL || 'https://csstationery.hk';
const CATEGORY_PATH = process.env.CATEGORY_PATH || '/world-globe/';
const MAX_PAGES = Number(process.env.MAX_PAGES || 5);
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
 *
 * csstationery.com is Magento (not WooCommerce). Product detail URLs sit
 * directly under the category path:  /world-globe/<slug>
 * Category pages use ?page=N for pagination. We therefore:
 *   1. take every <a> whose href starts with the category path
 *   2. exclude the bare category URL and pagination variants
 */
async function collectProductLinks(page) {
  const base = await page.evaluate(() => location.origin);
  const links = await page.$$eval('a', (as) =>
    as.map((a) => ({
      href: a.href,
      text: (a.textContent || '').trim(),
      cls: a.className || '',
    }))
  );

  const productish = links.filter((l) => {
    if (!l.href || !l.text || l.text.length < 3) return false;
    if (!/\/world-globe\//.test(l.href)) return false;
    // exclude the category itself and pagination links
    if (/\/world-globe\/?(\?|$)/.test(l.href)) return false;
    if (/\?page=/.test(l.href)) return false;
    return true;
  });

  const seen = new Set();
  return productish.filter((l) => {
    const clean = l.href.split('#')[0];
    if (seen.has(clean)) return false;
    seen.add(clean);
    l.href = clean;
    return true;
  });
}

/** Scrape one product page for its data (Magento DOM). */
async function scrapeProduct(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const t = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
    const meta = (name) =>
      document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || '';

    // Magento product page structure
    const title = t('.page-title') || t('h1.page-title') || t('h1') || meta('og:title');
    const summary =
      t('.product attribute.description .value') ||
      t('[data-product-attribute-description]') ||
      t('#description') ||
      t('.additional-attributes-wrapper');

    // Price
    const priceText =
      t('.price-wrapper .price') || t('.regular-price .price') || t('.price') || meta('product:price:amount');

    // SKU
    const sku =
      t('.product attribute.sku .value') ||
      t('[data-product-sku]') ||
      t('.product-info-sku') ||
      '';

    // Availability
    const stockText = t('.stock') || t('.product attribute.stock .value') || '';

    // Colour / size swatch attributes
    const attributes = {};
    document.querySelectorAll('.product attribute .label').forEach((label) => {
      const name = label.textContent.replace(/[:\s]+$/, '').trim();
      const value = label.parentElement?.querySelector('.value')?.textContent?.trim();
      if (name && value) attributes[name] = value;
    });

    // Gallery images — the product's OWN image only.
    // The page also lists related products, so every candidate is matched
    // against the product title (via alt/title) to avoid pulling in
    // other products' photos.
    const imgs = new Set();
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const titleNorm = norm(title);

    const pushIfMatches = (src, altText) => {
      if (!src || src.includes('placeholder')) return;
      const alt = norm(altText);
      if (!alt) return;
      // alt must share a meaningful prefix/substring with the title
      if (alt === titleNorm || titleNorm.includes(alt) || alt.includes(titleNorm)) {
        imgs.add(src);
      }
    };

    document.querySelectorAll('img[data-largeimg], img[data-zoom-image]').forEach((img) => {
      pushIfMatches(
        img.getAttribute('data-zoom-image') || img.getAttribute('data-largeimg'),
        img.getAttribute('alt') || img.getAttribute('title')
      );
    });

    // 2x srcset gives the largest cached rendition of the same photo
    document.querySelectorAll('img[srcset*="2x"]').forEach((img) => {
      const twoX = (img.getAttribute('srcset') || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => / 2x$/.test(s))[0];
      if (twoX) pushIfMatches(twoX.replace(/ 2x$/, ''), img.getAttribute('alt') || img.getAttribute('title'));
    });

    // og:image is always this product
    if (meta('og:image')) imgs.add(meta('og:image'));

    // Feature bullets
    const features = [...document.querySelectorAll(
      '.product.attribute.description li, .additional-attributes-wrapper li, #description li'
    )]
      .map((li) => li.textContent.trim())
      .filter(Boolean)
      .slice(0, 12);

    return { title, priceText, summary, sku, stockText, features, images: [...imgs], attributes };
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

  // Paginate the category listing: ?page=N
  const allLinks = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const target = p === 1 ? SOURCE_URL : `${SOURCE_URL}?page=${p}`;
    if (p > 1) {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1200);
    }
    const links = await collectProductLinks(page);
    if (!links.length) {
      if (p === 1) console.log(`→ no links on page 1, trying fallback ${FALLBACK_URL}`);
      break;
    }
    const fresh = links.filter((l) => !allLinks.some((x) => x.href === l.href));
    if (!fresh.length) break; // no new products on this page → last page
    allLinks.push(...fresh);
    console.log(`→ page ${p}: ${fresh.length} new product links`);
    if (allLinks.length >= LIMIT) break;
  }

  let links = allLinks;

  if (!links.length) {
    console.log(`→ falling back to ${FALLBACK_URL}`);
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

  // Images are downloaded with plain fetch.
  //
  // Playwright's apiRequestContext fails on this host (returns 404 for cached
  // renditions that a normal browser fetch retrieves fine), so we use node's
  // built-in fetch with browser-like headers instead.
  const fetchImage = async (src, referer) => {
    if (!src) return null;
    try {
      const res = await fetch(src, {
        headers: {
          'User-Agent': UA,
          Referer: referer,
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 1024 ? buf : null;
    } catch (err) {
      return null;
    }
  };

  /**
   * Candidate URLs for one product image, best first.
   *
   * Magento stores images under /image/cache/catalog/<path>/<name>-<W>x<H>.<ext>.
   * The original lives at /media/catalog/<path>/<name>.<ext>. Some originals
   * were deleted upstream while a cached size still exists (and vice versa),
   * so try several variants and take the first that returns bytes.
   */
  function imageCandidates(src) {
    if (!src) return [];
    const out = [src];
    const m = src.match(/^(.*)\/([^/]+)-(\d+)x(\d+)([a-z]?)\.(jpg|jpeg|png|webp)$/i);
    if (m) {
      const [, dir, name, , , ext] = m;
      for (const suffix of ['-1000x1000', '-800x800', '-600x600', '-550x550', '-500x500', '']) {
        out.push(`${dir}/${name}${suffix}.${ext}`);
      }
      // original under /media/catalog/
      const media = src.replace('/image/cache/catalog/', '/media/catalog/')
        .replace(/-\d+x\d+[a-z]?\.(jpg|jpeg|png|webp)$/i, '.$1');
      out.push(media);
    }
    return [...new Set(out)];
  }

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

      let saved = false;
      for (const candidate of imageCandidates(src)) {
        const buf = await fetchImage(candidate, p.url);
        if (buf) {
          await writeFile(dest, buf);
          localImages.push(`/products/${filename}`);
          saved = true;
          break;
        }
      }
      if (!saved) console.warn(`  ! no image found for ${src}`);
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
