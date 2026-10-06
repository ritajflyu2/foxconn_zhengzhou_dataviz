import { select } from 'd3';
import { raw } from './dataLoader.js';
import { assembleIntoSimulator } from '../simulator/assemble.js';

const floorImages = import.meta.glob('../../assets/labor/floor_*.webp', { eager: true, query: '?url', import: 'default' });
const imageUrl = (name) => floorImages[`../../assets/labor/${name}`];

export const SIM = 'SIM'; // the simulator, as a "floor" of the elevator panel
const PITCH = 0.47; // vertical step between floors, as a share of a floor's height
const PAGE_FLOOR = '1F'; // the Labor page is the assembly-line floor
// Floors that open a page of the site: clicking one goes there.
const FLOOR_LINKS = { '1F': '#scene-1', '3F': '#mgmt-1', '4F': '#env-1' };
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

// Lets the page router mark the floor of the page now showing ('SIM' for the simulator).
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
// drawn in front with the others faded; the elevator panel under the stack
// shows it (and works the same way).
// 1F opens Labor (Scene 1, the floor), 3F Management and 4F Waste and Water Processing.
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

  // Under the stack: the elevator panel (floor window, floor buttons, simulator).
  const elevator = mountElevator(aside, {
    choose: (id) => choose(id),
    openSimulator: () => {
      hideHover();
      // Top floor first: 4F leads the flight, 1F lands last.
      const floors = [...FLOORS]
        .sort((a, b) => b.id.localeCompare(a.id))
        .map((f) => ({ id: f.id, href: imageUrl(f.image), rect: floorG.get(f.id).select('image').node().getBoundingClientRect() }));
      assembleIntoSimulator(floors);
    },
  });

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

  function setActive(id, initial = false) {
    elevator.set(id, initial);
    if (id === SIM) return; // the simulator: the stack keeps its last floor
    for (const f of FLOORS) {
      const on = f.id === id;
      floorG.get(f.id).classed('is-active', on);
      if (FLOOR_LINKS[f.id]) floorG.get(f.id).attr('aria-pressed', String(on));
    }
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
  setActive(PAGE_FLOOR, true);

  return aside;
}

// --- Elevator panel ----------------------------------------------------------
// A flat metal plate under the stack: a window with the direction arrows, the
// floor number ("01"–"04") and its name; under it the floor buttons (4 → 1) and
// the simulator button, either side of a divider. The pressed button and the
// window follow the page showing (setActive), whichever way it was opened.
const SVG_NS = 'http://www.w3.org/2000/svg';
const triangle = (d) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'elevator__arrow');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 11 10');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
};
const STACK_ICON =
  '<svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M11 3 19 7 11 11 3 7Z"/><path d="M3 10.5 11 14.5 19 10.5"/><path d="M3 14 11 18 19 14"/></svg>';
const FADE_MS = 150;
const PLATE_TO_STACK = 0.95; // the plate is this much as wide as the stack above it
const PLATE_ZOOM_MAX = 1.05;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function mountElevator(parent, { choose, openSimulator }) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const plate = el('div', 'elevator');
  plate.setAttribute('role', 'group');
  plate.setAttribute('aria-label', 'Elevator: go to a floor');

  // The window.
  const screen = el('div', 'elevator__screen');
  screen.setAttribute('aria-live', 'polite');
  const arrows = el('span', 'elevator__arrows');
  const down = triangle('M1 1h9L5.5 9z');
  const up = triangle('M1 9h9L5.5 1z');
  arrows.append(down, up);
  const readout = el('span', 'elevator__readout');
  const digits = el('span', 'elevator__digits');
  const name = el('span', 'elevator__name');
  readout.append(digits, name);
  screen.append(arrows, readout);

  // The buttons: floors on the left, the simulator on the right.
  const panel = el('div', 'elevator__panel');
  const floorCol = el('div', 'elevator__floors');
  const buttons = new Map();
  for (const f of [...FLOORS].sort((a, b) => b.id.localeCompare(a.id))) {
    const b = el('button', 'elevator__key', f.id[0]);
    b.type = 'button';
    b.setAttribute('aria-label', `${f.id} ${f.name}`);
    if (FLOOR_LINKS[f.id]) b.addEventListener('click', () => choose(f.id));
    else b.disabled = true; // 2F has no page yet, as in the stack
    floorCol.append(b);
    buttons.set(f.id, b);
  }
  const simCol = el('div', 'elevator__sim');
  const simKey = el('button', 'elevator__key');
  simKey.type = 'button';
  simKey.innerHTML = STACK_ICON;
  simKey.title = 'Explore the Electronics Manufacturing Ecosystem';
  simKey.setAttribute('aria-label', simKey.title);
  simKey.addEventListener('click', () => {
    set(SIM);
    openSimulator();
  });
  buttons.set(SIM, simKey);
  simCol.append(simKey, el('span', 'elevator__sim-label', 'Ecosystem simulator'));
  panel.append(floorCol, el('span', 'elevator__divider'), simCol);

  plate.append(screen, panel);
  parent.append(plate);

  // The plate scales with the floor stack above it (which follows the column
  // width), staying centred under it and inside the column.
  const stackEl = parent.querySelector('.floor-index__image svg');
  const fit = () => {
    if (!stackEl || !plate.isConnected) return;
    plate.style.zoom = '1';
    plate.style.marginLeft = '0px';
    const col = parent.getBoundingClientRect();
    const st = stackEl.getBoundingClientRect();
    if (!col.width || !st.width) return;
    const natural = plate.offsetWidth;
    const z = Math.min(PLATE_ZOOM_MAX, (st.width * PLATE_TO_STACK) / natural, (col.width - 8) / natural);
    plate.style.zoom = String(z);
    const centre = st.left + st.width / 2 - col.left;
    const pad = parseFloat(getComputedStyle(parent).paddingLeft) || 0;
    plate.style.marginLeft = `${(Math.max(0, centre - (natural * z) / 2) - pad) / z}px`;
  };
  new ResizeObserver(fit).observe(parent);
  if (stackEl) new ResizeObserver(fit).observe(stackEl);

  let current = null;
  let moved = false; // no arrow until the elevator has really moved once
  let fade = null;
  // `initial`: where the site opens (no arrow from it to the first page shown).
  function set(id, initial = false) {
    if (id === current) return;
    const prev = moved ? current : null;
    if (current != null && !initial) moved = true;
    current = id;
    for (const [key, b] of buttons) b.setAttribute('aria-pressed', String(key === id));
    // The arrow for the way the elevator just went (none on first load, or for the simulator).
    const dir = prev && prev !== SIM && id !== SIM ? (id > prev ? 'up' : 'down') : null;
    up.classList.toggle('is-lit', dir === 'up');
    down.classList.toggle('is-lit', dir === 'down');
    const floor = FLOORS.find((f) => f.id === id);
    const text = id === SIM ? ['◆◆', 'Ecosystem'] : [`0${id[0]}`, floor?.name ?? ''];
    const show = () => {
      [digits.textContent, name.textContent] = text;
      readout.classList.remove('is-fading');
    };
    clearTimeout(fade);
    if (!digits.textContent || reducedMotion()) show();
    else {
      readout.classList.add('is-fading');
      fade = setTimeout(show, FADE_MS);
    }
  }
  return { set };
}
