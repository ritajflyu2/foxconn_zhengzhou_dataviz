import { defineConfig } from 'vite';

// GitHub Pages serves the site at /<repo>/, so a build uses that as its base;
// `npm run dev` keeps serving from /.
const PAGES_BASE = '/foxconn_zhengzhou_dataviz/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  // Allow importing images from design/reference/ (one level above the Vite
  // root). The site still reads all DATA only from site/data/.
  server: { open: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
}));
