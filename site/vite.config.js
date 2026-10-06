import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// A fingerprint of the simulator copy, added to its iframe URL, so a browser
// never shows a cached older simulator after the site is updated.
const simVersion = () => {
  try {
    return createHash('sha1').update(readFileSync(new URL('./public/simulator/index.html', import.meta.url))).digest('hex').slice(0, 10);
  } catch {
    return 'dev';
  }
};

// GitHub Pages serves the site at /<repo>/, so a build uses that as its base;
// `npm run dev` keeps serving from /.
const PAGES_BASE = '/foxconn_zhengzhou_dataviz/';

// `npm run preview` serves the build, so it uses the same base.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  define: { __SIM_VERSION__: JSON.stringify(simVersion()) },
  // Allow importing images from design/reference/ (one level above the Vite
  // root). The site still reads all DATA only from site/data/.
  server: { open: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
}));
