import { scenes } from './scenes/index.js';
import { bySceneId } from './lib/dataLoader.js';
import { colorFor } from './lib/colorTokens.js';
import { circlesToDots } from './transitions/circlesToDots.js';
import { dotsToBars } from './transitions/dotsToBars.js';

const idFromHash = () => {
  const match = /^#scene-(\d+)$/.exec(window.location.hash);
  const id = match ? Number(match[1]) : NaN;
  return scenes.some((s) => s.id === id) ? id : scenes[0].id;
};

// Per spec: the floor nav appears on scenes 3-5, not on 1-2.
const FLOOR_NAV_SCENES = new Set([3, 4, 5]);

// Scene 5 ("When pay fails") is the one dark-ground scene (storyboard: "Two
// grounds, one switch") — toggled on <body> so the dark ground covers the
// whole page (header, scene nav, floor nav), not just the scene's content.
const DARK_SCENES = new Set([5]);

// Keyed "from>to". Only forward moves animate; anything else just mounts.
const TRANSITIONS = { '1>2': circlesToDots, '2>3': dotsToBars };

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createSceneManager({ nav, root, pageGrid }) {
  const buttons = new Map();
  let currentId = null;
  let navToken = 0;
  let active = null;

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

  async function show(id) {
    if (id === currentId) return;
    const token = ++navToken;

    // A running transition jumps to its end state before the next scene loads.
    if (active) {
      active.finish();
      await active.done;
    }
    if (token !== navToken) return;

    const from = currentId;
    const scene = scenes.find((s) => s.id === id);
    currentId = id;
    for (const [sceneId, button] of buttons) {
      button.setAttribute('aria-current', String(sceneId === id));
    }

    // Mount off-page, then swap in only if this is still the scene asked for:
    // Scene 2's mount is async, and a late resolve must not overwrite a newer scene.
    // Page chrome switches at the same moment, so the outgoing scene never
    // reflows into the new layout (e.g. the floor-nav column) while it is shown.
    const mountNext = async (onCommit) => {
      const stage = document.createElement('div');
      await scene.mount(stage, bySceneId[id]);
      if (token !== navToken) return false;
      pageGrid?.classList.toggle('has-floor-nav', FLOOR_NAV_SCENES.has(id));
      document.body.classList.toggle('theme-dark', DARK_SCENES.has(id));
      root.replaceChildren(...stage.childNodes);
      onCommit?.(root.firstElementChild);
      return true;
    };

    const transition = TRANSITIONS[`${from}>${id}`];
    if (transition && !reducedMotion()) {
      active = transition({ root, toData: bySceneId[id], mountNext });
      await active.done;
      active = null;
    } else {
      await mountNext();
    }
  }

  window.addEventListener('hashchange', () => show(idFromHash()));

  return { start: () => show(idFromHash()) };
}
