import './styles/global.css';
import { assertDataLoaded, files } from './lib/dataLoader.js';
import { createSceneManager } from './sceneManager.js';
import { createIntroManager } from './intro/introManager.js';
import { mountFloorNav } from './lib/floorNav.js';

const root = document.querySelector('#scene-root');
const pageGrid = document.querySelector('#page-grid');
const laborArrows = document.querySelector('#scene-arrows');
const introArrows = document.querySelector('#intro-arrows');
const pageTitleEl = document.querySelector('#page-title');
const pageSwitcherEl = document.querySelector('#page-switcher');

// Two independent pages sharing one #scene-root: Introduction (its own short
// series of screens) and Labor (the 5-scene story this site started as).
// Which one a given hash belongs to is decided once, here — each page's own
// manager (sceneManager.js / introManager.js) only acts on hashes it owns
// (see their own idFromHash guards), so this router just owns the page-level
// chrome: title, the switcher, which arrow bar shows, and Labor-only state
// (the floor nav, the dark ground) left over when leaving Labor.
const PAGES = {
  labor: { label: 'Labor', title: 'Behind the Line — Labor' },
  intro: { label: 'Introduction', title: 'Introduction' },
};
const pageOf = (hash) => (hash.startsWith('#intro-') ? 'intro' : 'labor');

function buildPageSwitcher(onSelect) {
  const buttons = new Map();
  for (const [key, cfg] of Object.entries(PAGES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = cfg.label;
    btn.addEventListener('click', () => onSelect(key));
    pageSwitcherEl.append(btn);
    buttons.set(key, btn);
  }
  return (key) => {
    for (const [k, btn] of buttons) btn.setAttribute('aria-current', String(k === key));
  };
}

try {
  assertDataLoaded();
  mountFloorNav(document.querySelector('#floor-nav-slot'));

  const laborManager = createSceneManager({ nav: laborArrows, root, pageGrid });
  const introManager = createIntroManager({ nav: introArrows, root });

  const setSwitcherCurrent = buildPageSwitcher((key) => {
    window.location.hash = key === 'intro' ? `intro-${introManager.scenes[0].id}` : 'scene-1';
  });

  let currentPage = null;
  function syncPageChrome() {
    const page = pageOf(window.location.hash);
    if (page === currentPage) return;
    // The page being left just had its #scene-root content overwritten by
    // the one taking over — tell it so, or returning to it later would
    // no-op (its manager still thinks its old scene is on the page).
    (page === 'labor' ? introManager : laborManager).invalidate();
    currentPage = page;
    pageTitleEl.textContent = PAGES[page].title;
    document.title = `Foxconn Zhengzhou — ${PAGES[page].label}`;
    setSwitcherCurrent(page);
    laborArrows.hidden = page !== 'labor';
    introArrows.hidden = page !== 'intro';
    if (page !== 'labor') {
      pageGrid.classList.remove('has-floor-nav');
      document.body.classList.remove('theme-dark');
    }
  }
  window.addEventListener('hashchange', syncPageChrome);
  syncPageChrome();

  laborManager.start();
  introManager.start();

  console.info(`Loaded ${files.length} data files: ${files.join(', ')}`);
} catch (error) {
  root.innerHTML = '<p class="caveat"></p>';
  root.querySelector('p').textContent = `Data did not load: ${error.message}`;
  throw error;
}
