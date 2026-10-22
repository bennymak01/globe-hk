import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://globe-hk.vercel.app
export default defineConfig({
  site: 'https://globe-hk.vercel.app',
  // Vercel's cleanUrls + GitHub Pages both expect FLAT files (about.html),
  // not directory indexes (about/index.html). Astro's default 'directory'
  // format is what made every HTML route 404 on Vercel.
  build: {
    format: 'file',
  },
  // Match the vercel.json trailingSlash setting so canonical URLs and
  // internal links agree with what the host actually serves.
  trailingSlash: 'never',
  integrations: [sitemap()],
});
