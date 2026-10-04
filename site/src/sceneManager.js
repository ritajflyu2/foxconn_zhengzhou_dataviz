import { scenes } from './scenes/index.js';
import { bySceneId } from './lib/dataLoader.js';
import { circlesToDots } from './transitions/circlesToDots.js';
import { dotsToBars } from './transitions/dotsToBars.js';
import { postsToLegend } from './transitions/postsToLegend.js';
import { fireBurn } from './transitions/fireBurn.js';

// Returns null (not a default scene id) when the hash belongs to another page
// (e.g. the Introduction page's #intro-N) — only an empty hash or a Labor
// #scene-N hash is this page's to act on; see introManager.js's idFromHash
// for the mirror of this on its own prefix.
const idFromHash = () => {
  if (window.location.hash && !window.location.hash.startsWith('#scene-')) return null;
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
const TRANSITIONS = { '1>2': circlesToDots, '2>3': dotsToBars, '3>4': postsToLegend, '4>5': fireBurn };

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const go = (id) => {
  if (scenes.some((s) => s.id === id)) window.location.hash = `scene-${id}`;
};

// Previous / next arrows with "Scene n of 5 · label" between them. A running
// transition that holds for the viewer (3 → 4's word cloud) takes the next
// press itself through its `next()`; otherwise next goes to the next scene.
function createArrows(nav, getCurrent, getActive) {
  const forward = () => {
    if (getActive()?.next?.()) return;
    go(getCurrent() + 1);
  };
  const arrow = (dir, glyph) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `scene-arrows__btn scene-arrows__btn--${dir}`;
    b.textContent = glyph;
    b.addEventListener('click', () => (dir === 'next' ? forward() : go(getCurrent() - 1)));
    return b;
  };
  const prev = arrow('prev', '← Back');
  const next = arrow('next', 'Next →');
  const label = document.createElement('p');
  label.className = 'scene-arrows__label';
  label.setAttribute('aria-live', 'polite');
  nav.append(prev, label, next);

  // Arrow keys too — except while a slider or text field has focus (they use
  // them), or while another page (e.g. Introduction) is the one showing.
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (window.location.hash.startsWith('#intro-')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return;
    if (e.key === 'ArrowRight') forward();
    else if (e.key === 'ArrowLeft') go(getCurrent() - 1);
  });

  const first = scenes[0].id;
  const last = scenes[scenes.length - 1].id;
  return (id) => {
    const scene = scenes.find((s) => s.id === id);
    const before = scenes.find((s) => s.id === id - 1);
    const after = scenes.find((s) => s.id === id + 1);
    label.textContent = `Scene ${id} of ${scenes.length} · ${scene.navLabel}`;
    prev.disabled = id === first;
    next.disabled = id === last;
    prev.setAttribute('aria-label', before ? `Previous scene: ${before.navLabel}` : 'No previous scene');
    next.setAttribute('aria-label', after ? `Next scene: ${after.navLabel}` : 'No next scene');
  };
}

export function createSceneManager({ nav, root, pageGrid }) {
  let currentId = null;
  let navToken = 0;
  let active = null;
  const updateArrows = createArrows(nav, () => currentId, () => active);

  async function show(id) {
    if (id == null || id === currentId) return;
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
    updateArrows(id);

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

    // Transitions are skipped under reduced motion, unless one has its own
    // reduced version (the fire's quick fade to black).
    // Only when the outgoing scene is actually on the page: a transition cut
    // short by a newer navigation can leave nothing to animate from.
    const transition = root.querySelector('.scene') ? TRANSITIONS[`${from}>${id}`] : null;
    const reduced = reducedMotion();
    if (transition && (!reduced || transition.hasReducedMotion)) {
      active = transition({ root, toData: bySceneId[id], mountNext, reduced });
      await active.done;
      active = null;
    } else {
      await mountNext();
    }
  }

  window.addEventListener('hashchange', () => {
    const id = idFromHash();
    if (id != null) show(id);
  });

  return {
    start: () => {
      const id = idFromHash();
      if (id != null) show(id);
    },
    // Called by main.js's page router when another page (Introduction) has
    // taken over #scene-root — without this, returning here would no-op
    // (id === currentId) even though the DOM no longer shows this scene.
    invalidate: () => {
      currentId = null;
    },
  };
}
