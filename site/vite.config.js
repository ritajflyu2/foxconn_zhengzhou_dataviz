import { defineConfig } from 'vite';

// GitHub Pages serves the site at /<repo>/, so a build uses that as its base;
// `npm run dev` keeps serving from /.
const PAGES_BASE = '/foxconn_zhengzhou_dataviz/';

// `npm run preview` serves the build, so it uses the same base.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  // Allow importing images from design/reference/ (one level above the Vite
  // root). The site still reads all DATA only from site/data/.
  server: { open: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
}));
