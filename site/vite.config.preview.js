import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// A one-off config for exporting a single shareable preview HTML file
// (fonts/images/JS/CSS all inlined). Not used by `npm run dev`/`build`/
// `deploy` — those keep the normal multi-file dist/ output.
export default defineConfig({
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist-preview', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  plugins: [viteSingleFile()],
});
