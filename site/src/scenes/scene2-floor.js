import { select } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../lib/sceneShell.js';
import { colorFor } from '../lib/colorTokens.js';
import { count, percent } from '../lib/format.js';
import { LINE_DOT_R, seededRandom, kinds, lineFloorDots } from '../lib/floorDots.js';

import lineUrl from '../../assets/labor/production_line.webp';
import dormUrl from '../../assets/labor/dorm.webp';

// Scene 2: one assembly floor and one dorm room, one dot per worker. Every
// line gets its 120 workers along its own workbench row, every bed its
// sleeper; the insured / dispatch mix is Scene 1's campus-wide ratio.

const BED_DOT_R = 26; // in dorm image px
const IMAGES = { 'production_line.webp': lineUrl, 'dorm.webp': dormUrl };

function legendItem(color, label, value) {
  const li = document.createElement('li');
  li.className = 'legend__item';
  if (color) {
    const sw = document.createElement('span');
    sw.className = 'legend__swatch';
    sw.style.background = color;
    li.append(sw);
  }
  const l = document.createElement('span');
  l.textContent = label;
  li.append(l);
  if (value) {
    const v = document.createElement('span');
    v.className = 'legend__value';
    v.textContent = value;
    li.append(v);
  }
  return li;
}

// The per-person floor area as a square at the same scale as the room it
// sits in (room outline around it), with its side length marked.
function areaFigure(dorm) {
  const side = Math.sqrt(dorm.m2_per_person);
  const roomW = 6; // a room outline of the same area, 6 m wide
  const roomH = dorm.room_m2 / roomW;
  const U = 40; // svg units per metre
  const pad = 52;
  const W = roomW * U + pad * 2;
  const H = roomH * U + pad + 12;
  const svg = select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('class', 'dorm-area')
    .attr('role', 'img')
    .attr(
      'aria-label',
      `${dorm.m2_per_person} square metres per person, a square about ${side.toFixed(2)} metres on each side, inside a ${dorm.room_m2} square metre room for ${dorm.people}`
    );
  svg.append('rect').attr('class', 'dorm-area__room').attr('x', pad).attr('y', pad).attr('width', roomW * U).attr('height', roomH * U);
  svg
    .append('text')
    .attr('class', 'dorm-area__room-label')
    .attr('x', pad + roomW * U - 6)
    .attr('y', pad + roomH * U - 8)
    .attr('text-anchor', 'end')
    .text(`Room: ${dorm.room_m2} m²`);
  svg.append('rect').attr('class', 'dorm-area__person').attr('x', pad).attr('y', pad).attr('width', side * U).attr('height', side * U);
  svg
    .append('text')
    .attr('class', 'dorm-area__person-label')
    .attr('x', pad + (side * U) / 2)
    .attr('y', pad + (side * U) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'middle')
    .text(`${dorm.m2_per_person} m²`);
  const dim = (x1, y1, x2, y2, label, vertical) => {
    const g = svg.append('g').attr('class', 'size-dim');
    g.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
    const t = 5;
    const ticks = vertical ? [[x1 - t, y1, x1 + t, y1], [x2 - t, y2, x2 + t, y2]] : [[x1, y1 - t, x1, y1 + t], [x2, y2 - t, x2, y2 + t]];
    for (const [a, b, c, d] of ticks) g.append('line').attr('x1', a).attr('y1', b).attr('x2', c).attr('y2', d);
    const txt = g.append('text').attr('class', 'size-dim__label').attr('text-anchor', 'middle').text(label);
    if (vertical) txt.attr('transform', `translate(${x1 - 14}, ${(y1 + y2) / 2}) rotate(-90)`);
    else txt.attr('x', (x1 + x2) / 2).attr('y', y1 - 9);
  };
  dim(pad, pad - 14, pad + side * U, pad - 14, `${side.toFixed(2)} m`);
  dim(pad - 14, pad, pad - 14, pad + side * U, `${side.toFixed(2)} m`, true);
  return svg.node();
}

export default {
  id: 1,
  navLabel: 'On the line',
  colorKey: 'dispatch',

  async mount(container, data) {
    const { line, dorm } = data;
    const nLines = line.lines.length;
    const lineTotal = nLines * line.workers_per_line;

    const { el, body } = createScene({
      index: 1,
      title: 'On the line: worker density',
      summary: `One assembly floor and one dorm room, one dot per worker. A production line has about ${count(line.workers_per_line)} workers, so this floor's ${nLines} lines hold about ${count(
        lineTotal
      )}. Off shift, six of them share one room. About ${percent(data.insured_share)} are insured staff; the rest are dispatch workers.`,
    });

    const blue = colorFor('regular');
    const orange = colorFor('dispatch');
    const fillOf = { insured: blue, dispatch: orange };

    const legend = document.createElement('ul');
    legend.className = 'legend';
    legend.append(
      legendItem(blue, 'Insured', `${count(line.per_line.insured)} per line · ${count(dorm.per_room.insured)} per room`),
      legendItem(orange, 'Dispatch', `${count(line.per_line.dispatch)} per line · ${count(dorm.per_room.dispatch)} per room`),
      legendItem(null, '1 dot = 1 worker')
    );
    body.append(legend);

    const layout = document.createElement('div');
    layout.className = 'scene2-layout';
    body.append(layout);

    const rng = seededRandom(99);

    // --- the floor: 120 dots per line ---------------------------------------
    const floorFig = document.createElement('figure');
    floorFig.className = 'figure scene2-floor';
    const floorHead = document.createElement('p');
    floorHead.className = 'chart-col__head';
    floorHead.textContent = `The assembly floor: ${nLines} lines × ${count(line.workers_per_line)} workers`;
    floorFig.append(floorHead);
    layout.append(floorFig);
    const [lw, lh] = line.image_px;
    const floorSvg = select(floorFig)
      .append('svg')
      .attr('viewBox', `0 0 ${lw} ${lh}`)
      .attr('role', 'img')
      .attr('aria-label', `${nLines} production lines with ${count(line.workers_per_line)} worker dots each, ${count(line.per_line.insured)} insured and ${count(line.per_line.dispatch)} dispatch per line`);
    floorSvg.append('image').attr('class', 'floor-plan-image').attr('href', IMAGES[line.image]).attr('width', lw).attr('height', lh);
    const lineDots = lineFloorDots(line, rng);
    // `floor-dots` + data-kind are what the 1 → 2 and 2 → 3 transitions use.
    floorSvg
      .append('g')
      .attr('class', 'floor-dots')
      .selectAll('circle')
      .data(lineDots)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', LINE_DOT_R)
      .attr('data-kind', (d) => d.kind)
      .attr('fill', (d) => fillOf[d.kind]);
    const floorNote = document.createElement('p');
    floorNote.className = 'figure__note';
    floorNote.textContent = `${count(lineDots.length)} dots. ${data.shift_note}`;
    floorFig.append(floorNote);

    // --- the dorm: one dot per bed, and the space each person gets -----------
    const dormCol = document.createElement('div');
    dormCol.className = 'scene2-dorm';
    layout.append(dormCol);
    const dormFig = document.createElement('figure');
    dormFig.className = 'figure';
    const dormHead = document.createElement('p');
    dormHead.className = 'chart-col__head';
    dormHead.textContent = `After the shift: ${dorm.people} to a room`;
    dormFig.append(dormHead);
    dormCol.append(dormFig);
    const [dw, dh] = dorm.image_px;
    const dormSvg = select(dormFig)
      .append('svg')
      .attr('viewBox', `0 0 ${dw} ${dh}`)
      .attr('role', 'img')
      .attr('aria-label', `A dorm room with ${dorm.people} bunk beds, ${count(dorm.per_room.insured)} insured and ${count(dorm.per_room.dispatch)} dispatch workers`);
    dormSvg.append('image').attr('class', 'dorm-image').attr('href', IMAGES[dorm.image]).attr('width', dw).attr('height', dh);
    const bedKinds = kinds(dorm.per_room, rng);
    dormSvg
      .append('g')
      .attr('class', 'floor-dots dorm-dots')
      .selectAll('circle')
      .data(dorm.beds)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', BED_DOT_R)
      .attr('data-kind', (_d, i) => bedKinds[i])
      .attr('fill', (_d, i) => fillOf[bedKinds[i]]);

    const areaCol = document.createElement('div');
    areaCol.className = 'scene2-area';
    const areaHead = document.createElement('p');
    areaHead.className = 'chart-col__head';
    areaHead.textContent = `Side note: about ${dorm.m2_per_person} m² each`;
    const areaSub = document.createElement('p');
    areaSub.className = 'figure__note';
    areaSub.textContent = `China's dorm design standard: ${dorm.m2_per_person} m² of floor per person in a ${dorm.people}-person bunk room (${dorm.room_m2} m²).`;
    areaCol.append(areaHead, areaFigure(dorm), areaSub);
    dormCol.append(areaCol);

    addMethodNote(el, 'Sources and how the dots are placed', [
      `Workers per line: ${line.source}. Each line's dots run along its own row of workstations (found from the workstation monitors in the image), on both sides of the line.`,
      `Six to a room: ${dorm.people_source}. Space: ${dorm.size_source}.`,
      `Insured share: ${data.insured_share_source} (${percent(data.insured_share)}), giving ${count(line.per_line.insured)} insured and ${count(line.per_line.dispatch)} dispatch per line, ${count(dorm.per_room.insured)} and ${count(dorm.per_room.dispatch)} per room.`,
    ]);
    addCaveat(el, line.caveat, dorm.caveat);
    container.replaceChildren(el);

    // The floor image recedes so the workers read: as the dots arrive in the
    // 1 → 2 transition (it adds the class itself), or shortly after a direct load.
    if (!el.closest('.transition-ghost')) setTimeout(() => floorFig.classList.add('is-populated'), 400);
  },
};
