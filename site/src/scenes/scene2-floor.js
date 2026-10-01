import { select } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../lib/sceneShell.js';
import { colorFor } from '../lib/colorTokens.js';
import { count } from '../lib/format.js';

import floorUrl from '../../../design/reference/floorplan_1F.png';
import floorMaskUrl from '../../../design/reference/floor_mask.png';

const IMG = { w: 719, h: 440 };
const DOT_R = 4.4;
const DEBUG = false; // overlay the sampled mask in magenta, for calibration

// floor_mask.png marks the real floor area in white (everything else — walls,
// furniture, the dock — black), at the same aspect ratio as floorplan_1F.png
// but higher resolution. Drawing it onto a canvas sized to IMG lets us sample
// "is this point on the floor?" per pixel, exactly, instead of hand-picking
// corners.
function loadMaskPixels(url, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function isFloor(mask, x, y) {
  const xi = Math.min(mask.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(mask.height - 1, Math.max(0, Math.round(y)));
  return mask.data[(yi * mask.width + xi) * 4] > 128; // red channel; mask is pure black/white
}

// An even grid of cell centres (equal spacing, axis-aligned — not mapped to
// the floor's isometric edges), kept only where the mask is white.
function gridCells(cols, rows, mask) {
  const cells = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols) * IMG.w;
      const y = ((j + 0.5) / rows) * IMG.h;
      if (isFloor(mask, x, y)) cells.push([x, y]);
    }
  }
  return cells;
}

// Keep exactly `target` cells, spread evenly across the floor by striding the
// row-major list (which sweeps front-to-back, left-to-right).
function evenSubsample(cells, target) {
  if (cells.length <= target) return cells;
  const out = [];
  for (let k = 0; k < target; k++) out.push(cells[Math.floor((k * cells.length) / target)]);
  return out;
}

// Grow the grid density (keeping the canvas's aspect ratio) until the number
// of on-floor cells reaches the dot count, then thin back to exactly that many.
function placeDots(target, mask) {
  const aspect = IMG.w / IMG.h;
  for (let rows = 10; rows <= 120; rows++) {
    const cols = Math.max(1, Math.round(rows * aspect));
    const cells = gridCells(cols, rows, mask);
    if (cells.length >= target) return evenSubsample(cells, target);
  }
  return gridCells(Math.round(120 * aspect), 120, mask);
}

function seededRandom(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function spacePanel(space) {
  const aside = document.createElement('div');
  aside.className = 'space-panel';

  const square = document.createElement('div');
  square.className = 'space-panel__square';
  square.setAttribute('aria-hidden', 'true');
  const value = document.createElement('span');
  value.className = 'space-panel__value';
  value.textContent = `${space.value} m²`;
  square.append(value);

  const caption = document.createElement('div');
  const head = document.createElement('p');
  head.append(document.createTextNode('Space per worker'));
  head.className = 'space-panel__head';
  const tag = document.createElement('span');
  tag.className = 'tag-placeholder';
  tag.textContent = 'Placeholder';
  head.append(tag);

  const basis = document.createElement('p');
  basis.className = 'space-panel__basis';
  basis.textContent = space.basis;

  caption.append(head, basis);
  aside.append(square, caption);
  return aside;
}

export default {
  id: 2,
  navLabel: 'On the line',
  colorKey: 'dispatch',

  async mount(container, data) {
    const { el, body } = createScene({
      index: 2,
      title: 'On the line: worker density',
      summary:
        'The plant circles break into individual dots that pour onto one assembly-line floor. Each dot stands for about ' +
        `${count(data.workers_per_dot)} workers, split between insured staff and dispatch labor.`,
    });

    const blue = colorFor('regular');
    const orange = colorFor('dispatch');

    const legendEl = document.createElement('ul');
    legendEl.className = 'legend';
    for (const item of [
      { color: blue, label: 'Insured', value: count(data.insured_dots) },
      { color: orange, label: 'Dispatch', value: count(data.dispatch_dots) },
      { label: `1 dot = ${count(data.workers_per_dot)} workers` },
    ]) {
      const li = document.createElement('li');
      li.className = 'legend__item';
      if (item.color) {
        const sw = document.createElement('span');
        sw.className = 'legend__swatch';
        sw.style.background = item.color;
        li.append(sw);
      }
      const label = document.createElement('span');
      label.textContent = item.label;
      li.append(label);
      if (item.value) {
        const v = document.createElement('span');
        v.className = 'legend__value';
        v.textContent = item.value;
        li.append(v);
      }
      legendEl.append(li);
    }
    body.append(legendEl);

    const figure = document.createElement('figure');
    figure.className = 'figure';
    body.append(figure);

    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${IMG.w} ${IMG.h}`)
      .attr('role', 'img')
      .attr('aria-label', `${count(data.dots_total)} dots on the assembly-line floor, one dot for about ${count(data.workers_per_dot)} workers`);

    svg.append('image').attr('href', floorUrl).attr('x', 0).attr('y', 0).attr('width', IMG.w).attr('height', IMG.h);

    // Dots depend on the mask image decoding first.
    const mask = await loadMaskPixels(floorMaskUrl, IMG.w, IMG.h);

    if (DEBUG) {
      for (let y = 0; y < IMG.h; y += 3) {
        for (let x = 0; x < IMG.w; x += 3) {
          if (isFloor(mask, x, y)) {
            svg.append('circle').attr('cx', x).attr('cy', y).attr('r', 0.6).attr('fill', 'magenta');
          }
        }
      }
    }

    const positions = placeDots(data.dots_total, mask);

    // Colors: shuffle an array of the exact insured/dispatch counts, so the mix
    // is spread across the floor while the totals stay exact.
    const rng = seededRandom(99);
    const palette = [
      ...Array(data.insured_dots).fill(blue),
      ...Array(data.dispatch_dots).fill(orange),
    ];
    for (let i = palette.length - 1; i > 0; i--) {
      const k = Math.floor(rng() * (i + 1));
      [palette[i], palette[k]] = [palette[k], palette[i]];
    }

    svg
      .append('g')
      .selectAll('circle')
      .data(positions)
      .join('circle')
      .attr('cx', (p) => p[0])
      .attr('cy', (p) => p[1])
      .attr('r', DOT_R)
      .attr('fill', (_p, i) => palette[i] ?? orange);

    const placed = document.createElement('p');
    placed.className = 'figure__note';
    placed.textContent = `${count(positions.length)} dots shown. ${data.shift_note}`;
    figure.append(placed);

    body.append(spacePanel(data.space_per_worker_m2));

    addMethodNote(el, 'How the dots are placed', [
      'Dots sit on an even grid (equal spacing, rows and columns parallel to the image edges), kept only where floor_mask.png marks real floor area — a precise mask of the tan floor shape, not a hand-picked set of corners. The layout is illustrative and covers the whole floor.',
      'The floor plan is a generic isometric stand-in, not a measured Foxconn layout.',
    ]);

    addCaveat(el, data.space_per_worker_m2.label + '. ' + data.space_per_worker_m2.basis);
    container.replaceChildren(el);
  },
};
