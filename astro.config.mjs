import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Live URL: https://www.globes.hk
export default defineConfig({
  site: 'https://www.globes.hk',

  // 'directory' writes about/index.html — resolved natively by BOTH
  // GitHub Pages and Vercel's static serving.
  //
  // Do NOT combine build.format:'file' with vercel.json cleanUrls:true —
  // Vercel rewrites /index.html -> / with no file to serve at /, so the
  // homepage 404s while every other route works. cleanUrls:true also strips
  // the directory index of /about/ and 404s it.
  build: {
    format: 'directory',
  },

  // Must match the trailing-slash style the host actually serves.
  trailingSlash: 'always',

  integrations: [sitemap()],
});
