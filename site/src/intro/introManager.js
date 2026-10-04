import { introScenes } from './scenes/index.js';

// Mirrors sceneManager.js's hash scheme (#scene-N) on its own prefix
// (#intro-N), so the two pages' routers never collide — see main.js, which
// decides which page a given hash belongs to before either manager acts on it.
function idFromHash() {
  const match = /^#intro-(\d+)$/.exec(window.location.hash);
  if (!match) return null;
  const id = Number(match[1]);
  return introScenes.some((s) => s.id === id) ? id : introScenes[0].id;
}

const go = (id) => {
  if (introScenes.some((s) => s.id === id)) window.location.hash = `intro-${id}`;
};

function createArrows(nav, getCurrent) {
  const arrow = (dir, glyph) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `scene-arrows__btn scene-arrows__btn--${dir}`;
    b.textContent = glyph;
    b.addEventListener('click', () => go(getCurrent() + (dir === 'next' ? 1 : -1)));
    return b;
  };
  const prev = arrow('prev', '← Back');
  const next = arrow('next', 'Next →');
  const label = document.createElement('p');
  label.className = 'scene-arrows__label';
  label.setAttribute('aria-live', 'polite');
  nav.append(prev, label, next);

  // Only act on arrow keys while the Introduction page is the one showing —
  // otherwise this would also fire (and hijack navigation) while on Labor.
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!window.location.hash.startsWith('#intro-')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return;
    if (e.key === 'ArrowRight') go(getCurrent() + 1);
    else if (e.key === 'ArrowLeft') go(getCurrent() - 1);
  });

  const first = introScenes[0].id;
  const last = introScenes[introScenes.length - 1].id;
  return (id) => {
    const scene = introScenes.find((s) => s.id === id);
    const before = introScenes.find((s) => s.id === id - 1);
    const after = introScenes.find((s) => s.id === id + 1);
    label.textContent = `Introduction ${id} of ${introScenes.length} · ${scene.navLabel}`;
    prev.disabled = id === first;
    next.disabled = id === last;
    prev.setAttribute('aria-label', before ? `Previous: ${before.navLabel}` : 'No previous screen');
    next.setAttribute('aria-label', after ? `Next: ${after.navLabel}` : 'No next screen');
  };
}

export function createIntroManager({ nav, root }) {
  let currentId = null;
  const updateArrows = createArrows(nav, () => currentId);

  function show(id) {
    if (id === currentId) return;
    const scene = introScenes.find((s) => s.id === id);
    if (!scene) return;
    currentId = id;
    updateArrows(id);
    scene.mount(root);
  }

  window.addEventListener('hashchange', () => {
    const id = idFromHash();
    if (id != null) show(id);
  });

  return {
    scenes: introScenes,
    start: () => {
      const id = idFromHash();
      if (id != null) show(id);
    },
    // Called by main.js's page router when Labor has taken over #scene-root
    // — without this, returning here would no-op (id === currentId) even
    // though the DOM no longer shows this scene.
    invalidate: () => {
      currentId = null;
    },
  };
}
