/**
 * Single source of truth for store details.
 * Edit here → every page updates.
 */

export const SITE = {
  name: 'GlobeHK',
  nameZh: '地球儀專門店',
  tagline: '香港地球儀專門店',
  legalName: '志成文具 CS Stationery',
  established: 1984,
  domain: 'globe-hk.vercel.app',
  url: 'https://globe-hk.vercel.app',
  parentSite: 'https://csstationery.hk',
  parentSiteCom: 'https://csstationery.com',
  locale: 'zh-HK',
  author: 'Jack Mak',
  authorRole: '主理人',
} as const;

export const CONTACT = {
  whatsapp: '85297364155',
  whatsappDisplay: '+852 9736 4155',
  phone: '9736 4155',
  addressLine1: '九龍界限街 12 號 C 地下',
  addressLine2: '界限街 12 號 C 地下',
  district: '旺角',
  area: '九龍',
  country: '香港',
  postcode: '',
  mapsUrl: 'https://maps.google.com/?q=九龍界限街12號',
  hours: '星期一至六 10:00–19:30 · 星期日及公眾假期 休息',
  email: '',
} as const;

export function waLink(message: string) {
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const NAV = [
  { label: '全部地球儀', href: '/products/' },
  { label: '分類', href: '/products/#series' },
  { label: '選購指南', href: '/blog/' },
  { label: '關於志成', href: '/about/' },
  { label: '聯絡我們', href: '/contact/' },
] as const;

export const SERIES = {
  education: { label: '學習教育', icon: '🎓', desc: '小學常識科教學、繁中／中英對照' },
  smart: { label: 'AR 智能', icon: '📱', desc: 'AR App 互動、發光、恐龍與星座' },
  lamp: { label: '燈光擺設', icon: '💡', desc: '暖光夜燈、木質金屬底座、書房陳列' },
  decor: { label: '工藝擺設', icon: '🏛️', desc: '辦公室與家居高級擺設' },
} as const;

export type SeriesKey = keyof typeof SERIES;

/** Map the scraper's series keys to the store's four series. */
export function normalizeSeries(s?: string): SeriesKey {
  const v = (s || '').toLowerCase();
  if (v === 'ar' || v === 'smart') return 'smart';
  if (v === 'lamp' || v === 'illuminated') return 'lamp';
  if (v === 'decor' || v === 'wood' || v === 'desk-decor') return 'decor';
  return 'education';
}
