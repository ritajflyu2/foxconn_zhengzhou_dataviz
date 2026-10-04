import './styles/global.css';
import { assertDataLoaded, files } from './lib/dataLoader.js';
import { createSceneManager } from './sceneManager.js';
import { createIntroManager } from './intro/introManager.js';
import { createEnvManager } from './environment/envManager.js';
import { createMgmtManager } from './management/mgmtManager.js';
import { mountFloorNav, setFloorActive } from './lib/floorNav.js';

const root = document.querySelector('#scene-root');
const pageGrid = document.querySelector('#page-grid');
const laborArrows = document.querySelector('#scene-arrows');
const introArrows = document.querySelector('#intro-arrows');
const envArrows = document.querySelector('#env-arrows');
const mgmtArrows = document.querySelector('#mgmt-arrows');
const pageTitleEl = document.querySelector('#page-title');
const pageSwitcherEl = document.querySelector('#page-switcher');

// Independent pages sharing one #scene-root: Introduction (its own short
// series of screens), Labor (the 5-scene story this site started as) and
// Waste and Water Processing (the factory's top floor in the floor index).
// Which one a given hash belongs to is decided once, here — each page's own
// manager (sceneManager.js / introManager.js) only acts on hashes it owns
// (see their own idFromHash guards), so this router just owns the page-level
// chrome: title, the switcher, which arrow bar shows, and Labor-only state
// (the floor nav, the dark ground) left over when leaving Labor.
// Tab order: Introduction first.
const PAGES = {
  intro: { label: 'Introduction', title: 'Introduction' },
  labor: { label: 'Labor', title: 'Behind the Line — Labor' },
  mgmt: { label: 'Management', title: 'Management' },
  env: { label: 'Waste and Water Processing', title: 'Waste and Water Processing' },
};
const pageOf = (hash) =>
  hash.startsWith('#intro-') ? 'intro' : hash.startsWith('#env-') ? 'env' : hash.startsWith('#mgmt-') ? 'mgmt' : 'labor';
// The floor of the factory each page lives on, in the floor index.
const PAGE_FLOOR = { labor: '1F', mgmt: '3F', env: '4F' };

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

// With no screen in the address, the site opens on the first tab.
if (!window.location.hash) history.replaceState(null, '', '#intro-1');

try {
  assertDataLoaded();
  mountFloorNav(document.querySelector('#floor-nav-slot'));

  const laborManager = createSceneManager({ nav: laborArrows, root, pageGrid });
  const introManager = createIntroManager({ nav: introArrows, root });
  const envManager = createEnvManager({ nav: envArrows, root });
  const mgmtManager = createMgmtManager({ nav: mgmtArrows, root });
  const managers = { labor: laborManager, intro: introManager, env: envManager, mgmt: mgmtManager };

  const setSwitcherCurrent = buildPageSwitcher((key) => {
    window.location.hash =
      key === 'intro' ? `intro-${introManager.scenes[0].id}` : key === 'env' ? `env-${envManager.scenes[0].id}` : key === 'mgmt' ? `mgmt-${mgmtManager.scenes[0].id}` : 'scene-1';
  });

  let currentPage = null;
  function syncPageChrome() {
    const page = pageOf(window.location.hash);
    if (page === currentPage) return;
    // The page being left just had its #scene-root content overwritten by
    // the one taking over — tell it so, or returning to it later would
    // no-op (its manager still thinks its old scene is on the page).
    for (const [key, m] of Object.entries(managers)) if (key !== page) m.invalidate();
    currentPage = page;
    pageTitleEl.textContent = PAGES[page].title;
    document.body.dataset.page = page;
    document.title = `Foxconn Zhengzhou — ${PAGES[page].label}`;
    setSwitcherCurrent(page);
    laborArrows.hidden = page !== 'labor';
    introArrows.hidden = page !== 'intro';
    envArrows.hidden = page !== 'env';
    mgmtArrows.hidden = page !== 'mgmt';
    if (page !== 'labor') {
      // The floor index stays beside Management (3F) and Waste and Water (4F).
      pageGrid.classList.toggle('has-floor-nav', page === 'env' || page === 'mgmt');
      document.body.classList.remove('theme-dark');
    }
    if (PAGE_FLOOR[page]) setFloorActive(PAGE_FLOOR[page]);
  }
  window.addEventListener('hashchange', syncPageChrome);
  syncPageChrome();

  laborManager.start();
  introManager.start();
  envManager.start();
  mgmtManager.start();

  console.info(`Loaded ${files.length} data files: ${files.join(', ')}`);
} catch (error) {
  root.innerHTML = '<p class="caveat"></p>';
  root.querySelector('p').textContent = `Data did not load: ${error.message}`;
  throw error;
}
