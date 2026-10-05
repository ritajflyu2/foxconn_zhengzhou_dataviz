import { select } from 'd3';
import { raw } from './dataLoader.js';
import { assembleIntoSimulator } from '../simulator/assemble.js';

const floorImages = import.meta.glob('../../assets/labor/floor_*.webp', { eager: true, query: '?url', import: 'default' });
const imageUrl = (name) => floorImages[`../../assets/labor/${name}`];

const PITCH = 0.47; // vertical step between floors, as a share of a floor's height
const PAGE_FLOOR = '1F'; // the Labor page is the assembly-line floor
// Floors that open a page of the site: clicking one goes there.
const FLOOR_LINKS = { '1F': '#scene-2', '3F': '#mgmt-1', '4F': '#env-1' };
const pageOfHash = (hash) => {
  for (const p of ['#env-', '#mgmt-', '#intro-']) if (hash.startsWith(p)) return p;
  return '#scene-';
};
let activate = null;
// Where a floor was last clicked (screen rect), so the page it opens can fly
// that floor from the index into place. Read once.
let clicked = null;
export function lastFloorClick(id) {
  const c = clicked && clicked.id === id && performance.now() - clicked.at < 2000 ? clicked.rect : null;
  clicked = null;
  return c;
}

// Lets the page router mark the floor of the page now showing.
export function setFloorActive(id) {
  activate?.(id);
}

// Floors stacked 1F at the bottom, upper floors drawn in front (as in the
// exploded reference view). Positions in viewBox units, top-left of each image.
function layout(floors) {
  const w = Math.max(...floors.map((f) => f.image_px[0]));
  const step = Math.max(...floors.map((f) => f.image_px[1])) * PITCH;
  const bottomUp = [...floors].sort((a, b) => a.id.localeCompare(b.id));
  const placed = bottomUp.map((f, i) => ({ ...f, x: (w - f.image_px[0]) / 2, y: (bottomUp.length - 1 - i) * step }));
  const h = Math.max(...placed.map((f) => f.y + f.image_px[1]));
  return { w, h, placed };
}

const { w: VIEW_W, h: VIEW_H, placed: FLOORS } = layout(raw.floor_index.floors);

// 1F's box as fractions of the index image (the 2 → 3 transition flies the
// Scene 2 floor plan into it).
export const INDEX_1F = (() => {
  const f = FLOORS.find((d) => d.id === PAGE_FLOOR);
  return { cx: (f.x + f.image_px[0] / 2) / VIEW_W, cy: (f.y + f.image_px[1] / 2) / VIEW_H, width: (f.image_px[0] * 0.9) / VIEW_W };
})();

// Site-level chrome, not scene content: shows where the Labor page sits in the
// building. `root` is the always-present #floor-nav-slot element; sceneManager
// shows/hides it per scene by toggling a class on the shared page grid, so
// this module never needs to know which scene is active.
//
// Every floor is clickable (or Tab + Enter): the clicked floor becomes active,
// drawn in front with the others faded, and its name sits under the stack.
// 1F opens Labor (Scene 2, over time), 3F Management and 4F Waste and Water Processing.
// Hovering a floor fades everything else further and shows a legend for it
// on the left (floor number, a leader line, the name), only while hovered.
export function mountFloorNav(root) {
  const aside = root;
  aside.setAttribute('aria-label', 'Floor index');

  const imgWrap = document.createElement('div');
  imgWrap.className = 'floor-index__image';
  const svg = select(imgWrap)
    .append('svg')
    .attr('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`)
    .attr('role', 'group')
    .attr('aria-label', 'The factory building, floor by floor');
  aside.append(imgWrap);

  const floorG = new Map();
  for (const f of FLOORS) {
    const g = svg
      .append('g')
      .attr('class', 'floor-index__floor')
      .attr('data-floor', f.id)
      .attr('transform', `translate(${f.x}, ${f.y})`)
      .attr('aria-label', `${f.id}: ${f.name}`);
    // Only floors with a page of their own take hover, focus and clicks
    // (2F, Automation, has none yet: it stays in the stack, inert).
    if (FLOOR_LINKS[f.id]) g.attr('tabindex', 0).attr('role', 'button');
    else g.classed('is-inert', true).attr('role', 'img');
    g.append('image').attr('href', imageUrl(f.image)).attr('width', f.image_px[0]).attr('height', f.image_px[1]);
    // Only the floor's own outline takes the pointer, not its transparent box.
    g.append('polygon').attr('class', 'floor-index__hit').attr('points', f.hull.map((p) => p.join(',')).join(' '));
    floorG.set(f.id, g);
  }

  // A floor legend: big floor number, then its name.
  const legend = (cls) => {
    const el = document.createElement('div');
    el.className = `floor-legend ${cls}`;
    const head = document.createElement('p');
    head.className = 'floor-legend__head';
    const num = document.createElement('span');
    num.className = 'floor-legend__id';
    head.append(num);
    const name = document.createElement('p');
    name.className = 'floor-legend__name';
    el.append(head, name);
    return {
      el,
      head,
      set(f) {
        num.textContent = f.id;
        name.textContent = f.name;
      },
    };
  };

  // Hover legend on the left, level with the hovered floor, with a leader line to it.
  const hover = legend('floor-legend--hover');
  const line = document.createElement('span');
  line.className = 'floor-legend__line';
  hover.head.append(line);
  hover.el.hidden = true;
  imgWrap.append(hover.el);

  // The active floor's name under the stack, always shown.
  const current = legend('floor-legend--active');
  current.el.setAttribute('aria-live', 'polite');
  aside.append(current.el);

  // Under the stack: all four floors come together as the simulator's building.
  const explore = document.createElement('button');
  explore.type = 'button';
  explore.className = 'floor-index__explore';
  explore.textContent = 'Explore the Electronics Manufacturing Ecosystem';
  explore.addEventListener('click', () => {
    hideHover();
    // Top floor first: 4F leads the flight, 1F lands last.
    const floors = [...FLOORS]
      .sort((a, b) => b.id.localeCompare(a.id))
      .map((f) => ({ id: f.id, href: imageUrl(f.image), rect: floorG.get(f.id).select('image').node().getBoundingClientRect() }));
    assembleIntoSimulator(floors);
  });
  aside.append(explore);

  const showHover = (f) => {
    hover.set(f);
    hover.el.style.top = `${((f.y + f.image_px[1] * 0.5) / VIEW_H) * 100}%`;
    hover.el.hidden = false;
    svg.classed('is-hovering', true);
    for (const [id, g] of floorG) g.classed('is-hovered', id === f.id);
  };
  const hideHover = () => {
    hover.el.hidden = true;
    svg.classed('is-hovering', false);
    for (const g of floorG.values()) g.classed('is-hovered', false);
  };

  function setActive(id) {
    for (const f of FLOORS) {
      const on = f.id === id;
      floorG.get(f.id).classed('is-active', on);
      if (FLOOR_LINKS[f.id]) floorG.get(f.id).attr('aria-pressed', String(on));
    }
    current.set(FLOORS.find((f) => f.id === id));
    // In front: the active floor is painted last; the rest keep their stacking.
    // The others move in front of it in the DOM, so the active one (which may
    // have focus) never moves.
    const activeNode = floorG.get(id).node();
    for (const f of FLOORS) if (f.id !== id) svg.node().insertBefore(floorG.get(f.id).node(), activeNode);
  }

  for (const f of FLOORS) {
    if (!FLOOR_LINKS[f.id]) continue;
    floorG
      .get(f.id)
      .on('pointerenter focus', () => showHover(f))
      .on('pointerleave blur', hideHover)
      .on('click', () => choose(f.id))
      .on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose(f.id);
        }
      });
  }
  // A floor with a page of its own opens it (unless it is already showing).
  function choose(id) {
    setActive(id);
    const link = FLOOR_LINKS[id];
    if (link && pageOfHash(window.location.hash) !== pageOfHash(link)) {
      clicked = { id, rect: floorG.get(id).node().getBoundingClientRect(), at: performance.now() };
      window.location.hash = link.slice(1);
    }
  }
  activate = setActive;
  setActive(PAGE_FLOOR);

  return aside;
}
