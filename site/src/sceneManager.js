import { scenes } from './scenes/index.js';
import { bySceneId } from './lib/dataLoader.js';
import { colorFor } from './lib/colorTokens.js';

const idFromHash = () => {
  const match = /^#scene-(\d+)$/.exec(window.location.hash);
  const id = match ? Number(match[1]) : NaN;
  return scenes.some((s) => s.id === id) ? id : scenes[0].id;
};

// Per spec: the floor nav appears on scenes 3-5, not on 1-2.
const FLOOR_NAV_SCENES = new Set([3, 4, 5]);

export function createSceneManager({ nav, root, pageGrid }) {
  const buttons = new Map();
  let currentId = null;

  for (const scene of scenes) {
    const button = document.createElement('button');
    button.type = 'button';

    const dot = document.createElement('span');
    dot.className = 'nav-dot';
    dot.style.background = colorFor(scene.colorKey ?? 'regular');
    button.append(dot, document.createTextNode(`${scene.id}. ${scene.navLabel}`));

    button.addEventListener('click', () => {
      window.location.hash = `scene-${scene.id}`;
    });

    nav.append(button);
    buttons.set(scene.id, button);
  }

  function show(id) {
    if (id === currentId) return;
    const scene = scenes.find((s) => s.id === id);

    scene.mount(root, bySceneId[scene.id]);
    currentId = id;

    pageGrid?.classList.toggle('has-floor-nav', FLOOR_NAV_SCENES.has(id));

    for (const [sceneId, button] of buttons) {
      button.setAttribute('aria-current', String(sceneId === id));
    }
  }

  window.addEventListener('hashchange', () => show(idFromHash()));

  return { start: () => show(idFromHash()) };
}
