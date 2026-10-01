import { defineConfig } from 'vite';

export default defineConfig({
  // Allow importing the floor-plan image from design/reference/ (one level above
  // the Vite root). The site still reads all DATA only from site/data/labor/.
  server: { open: true, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
});
