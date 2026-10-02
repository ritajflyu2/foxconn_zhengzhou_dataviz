import './styles/global.css';
import { assertDataLoaded, files } from './lib/dataLoader.js';
import { createSceneManager } from './sceneManager.js';
import { mountFloorNav } from './lib/floorNav.js';

const root = document.querySelector('#scene-root');

try {
  assertDataLoaded();
  mountFloorNav(document.querySelector('#floor-nav-slot'));
  createSceneManager({ nav: document.querySelector('#scene-arrows'), root, pageGrid: document.querySelector('#page-grid') }).start();
  console.info(`Loaded ${files.length} data files: ${files.join(', ')}`);
} catch (error) {
  root.innerHTML = '<p class="caveat"></p>';
  root.querySelector('p').textContent = `Data did not load: ${error.message}`;
  throw error;
}
