import { getCollection, type CollectionEntry } from 'astro:content';
import { normalizeSeries, type SeriesKey } from '../data/site';

export interface Product {
  slug: string;
  name: string;
  nameEn: string;
  price: number | null;
  size: string;
  language: string;
  series: SeriesKey;
  inStock: boolean;
  sourceUrl: string;
  images: string[];
  features: string[];
  description: string;
  body: string;
}

export const LANGUAGE_LABEL: Record<string, string> = {
  'zh-HK': '繁體中文',
  'zh-Hant': '繁體中文',
  both: '中英對照',
  en: '英文版',
  unknown: '多語言',
};

export function langLabel(l: string) {
  return LANGUAGE_LABEL[l] ?? '多語言';
}

/** Turn the raw scraped title into a readable Chinese product name. */
export function displayName(p: CollectionEntry<'products'>): string {
  const raw = p.data.name || '';
  // Already Chinese → use as-is
  if (/[\u4e00-\u9fff]/.test(raw)) return raw.trim();
  // Otherwise build a Chinese-flavoured name from the English + parsed attributes
  const size = p.data.size || '';
  const lang = langLabel(p.data.language);
  const seriesName = {
    education: '學習地球儀',
    smart: 'AR 智能互動地球儀',
    lamp: '燈光地球儀',
    decor: '地球儀擺設',
  }[p.data.series];
  const sizeCn = size ? size.replace(/(\d+(?:\.\d+)?)\s*吋/, '$1 吋').replace(/(\d+(?:\.\d+)?)\s*cm/i, '$1 厘米') : '';
  const base = `${sizeCn} ${seriesName}`.trim();
  return `${base}（${lang}）`;
}

export async function getProducts(): Promise<Product[]> {
  const entries = await getCollection('products');
  return entries.map((e) => ({
    slug: e.id.replace(/\.md$/, ''),
    name: displayName(e),
    nameEn: e.data.nameEn || e.data.name,
    price: e.data.priceHKD ?? null,
    size: e.data.size || '',
    language: e.data.language || 'unknown',
    series: normalizeSeries(e.data.series),
    inStock: e.data.inStock !== false,
    sourceUrl: e.data.sourceUrl || '',
    // The scraper can resolve several Magento cache renditions of the SAME photo
    // to one local file — dedupe so the gallery doesn't repeat an image.
    images: [...new Set(e.data.images || [])],
    features: e.data.features || [],
    description: (e.body || '').trim(),
    body: e.body || '',
  }));
}

export function bySeries(products: Product[], series: string): Product[] {
  if (!series || series === 'all') return products;
  return products.filter((p) => p.series === series);
}

/** Sort: in-stock first, then by size (cm) ascending, then price. */
export function sortProducts(list: Product[]): Product[] {
  const sizeCm = (s: string) => {
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:cm|厘米)/i);
    if (m) return parseFloat(m[1]);
    const inch = s.match(/(\d+(?:\.\d+)?)\s*(?:吋|")/);
    if (inch) return parseFloat(inch[1]) * 2.54;
    return 999;
  };
  return [...list].sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    const d = sizeCm(a.size) - sizeCm(b.size);
    if (Math.abs(d) > 0.01) return d;
    return (a.price ?? 1e9) - (b.price ?? 1e9);
  });
}
