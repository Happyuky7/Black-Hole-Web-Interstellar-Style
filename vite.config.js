import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// Public origin used in canonical URLs, social previews, robots.txt and the
// sitemap. Override at build time: SITE_URL=https://example.com pnpm build
const SITE_URL = (process.env.SITE_URL || 'https://gargantua.happyuky7.com').replace(/\/+$/, '');

/** Fills %SITE_URL% / %BUILD_DATE% / %APP_VERSION% in the HTML and emits robots.txt + sitemap.xml. */
function seo(){
  const fill = html => html
    .replaceAll('%SITE_URL%', SITE_URL)
    .replaceAll('%BUILD_DATE%', BUILD_DATE)
    .replaceAll('%APP_VERSION%', pkg.version);
  return {
    name: 'seo',
    transformIndexHtml: fill,
    generateBundle(){
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source:
`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
` });
      const url = (loc, priority) => `  <url>
    <loc>${SITE_URL}${loc}</loc>
    <lastmod>${BUILD_DATE}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source:
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url('/', '1.0')}
${url('/physics', '0.8')}
</urlset>
` });
    },
  };
}

export default defineConfig({
  // Relative base so the build also works from a sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [seo()],
  // Single source of truth for the version (package.json) and the build date.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  build: {
    chunkSizeWarningLimit: 900, // three.js is one big chunk, loaded after the start screen
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        physics: resolve(import.meta.dirname, 'physics.html'),
      },
    },
  },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
});
