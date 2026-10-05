// Copies the simulator from preview/Factory_Simulator.html (the file that is
// edited) to public/simulator/index.html (what the site serves). Runs before
// `dev` and `build`. preview/ is not in git, so where it is missing (e.g. the
// GitHub Pages build) the committed copy is kept as is.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../preview/Factory_Simulator.html');
const dest = resolve(here, '../public/simulator/index.html');

if (existsSync(src)) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log('sync:sim  preview/Factory_Simulator.html -> site/public/simulator/index.html');
} else if (existsSync(dest)) {
  console.log('sync:sim  preview/ not found; keeping the committed public/simulator/index.html');
} else {
  console.error('sync:sim  no simulator: preview/Factory_Simulator.html is missing');
  process.exit(1);
}
