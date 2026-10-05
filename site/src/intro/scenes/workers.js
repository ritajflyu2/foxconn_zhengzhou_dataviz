import { select, scaleSqrt, max, easeCubicInOut, line, curveCatmullRomClosed, geoMercator, polygonContains } from 'd3';
import zoneOutline from '../../../data/intro/airport_zone_outline.json';
import { createScene, addCaveat, addMethodNote } from '../introShell.js';
import { renderPlants, layerCard, combinedCard } from '../../scenes/scene1-plants.js';
import { createTooltip } from '../../lib/tooltip.js';
import { count, percent } from '../../lib/format.js';
import { raw } from '../../lib/dataLoader.js';

// The Introduction's last screen: Labor Scene 1's plant circles, in the
// Introduction's style. It opens on one circle for all four plants next to
// Harvard's student body (same area scale); clicking it splits it into the
// four plants. Hovering it shows the same cards as a plant, added up. The layout is landscape and turned (north points up-right; the
// compass shows it) so FII Precision sits beside the airport plants, not
// above them, and the screen fits one window.

const LANDSCAPE = {
  W: 1160,
  H: 540,
  BOX: { x0: 260, x1: 860, y0: 200, y1: 420 },
  GSD: { x: 1060, y: 430 },
  angle: 0, // north up: the zone's outline is drawn as traced
  compass: ['left', 70], // left of the drawing
  annotStop: 300, // the distance line stops short of FII Yuzhan's label
  annotAlong: true, // the distance label runs along its line, just above it
  annotDx: 0,
  annotDy: -14,
  annotAnchor: 'middle',
};
const MAX_R = 150; // as in Scene 1: the same area scale
const ZONE_TOP = 18; // the outline's top edge in the drawing
const LABEL_H = 54; // a plant's two label lines above its circle

// The airport zone's outline as traced in Google Earth (Size screen), north
// up, true proportions, width 1.
const ZONE_UNIT = (() => {
  const pts = zoneOutline.ring.slice(0, -1).map((c) => geoMercator().scale(1).translate([0, 0])(c));
  const x0 = Math.min(...pts.map((p) => p[0]));
  const x1 = Math.max(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1]));
  return { pts: pts.map(([x, y]) => [(x - x0) / (x1 - x0), (y - y0) / (x1 - x0)]), x0, x1, y0 };
})();
const toUnit = (lon, lat) => {
  const [x, y] = geoMercator().scale(1).translate([0, 0])([lon, lat]);
  return [(x - ZONE_UNIT.x0) / (ZONE_UNIT.x1 - ZONE_UNIT.x0), (y - ZONE_UNIT.y0) / (ZONE_UNIT.x1 - ZONE_UNIT.x0)];
};

// Puts the three airport plants inside the outline, near their true spots
// (relaxed so circles and labels do not overlap or cross the edge), and FII
// Precision outside to the north-west. Grows the outline until they fit.
function placeInZone(nodes) {
  const air = nodes.filter((d) => d.plant.zone === 'airport');
  const far = nodes.filter((d) => d.plant.zone !== 'airport');
  const pointsOf = (d) => [
    ...Array.from({ length: 20 }, (_, k) => [d.x + Math.cos((k / 20) * 2 * Math.PI) * (d.r + 8), d.y + Math.sin((k / 20) * 2 * Math.PI) * (d.r + 8)]),
    [d.x - 46, d.y - d.r - LABEL_H + 4],
    [d.x + 46, d.y - d.r - LABEL_H + 4],
  ];
  for (let Z = 520; Z <= 1100; Z += 20) {
    const ox = LANDSCAPE.BOX.x0;
    const poly = ZONE_UNIT.pts.map(([x, y]) => [ox + x * Z, ZONE_TOP + y * Z]);
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    for (const d of air) {
      const [ux, uy] = toUnit(d.plant.lon, d.plant.lat);
      d.x = d.ax = ox + ux * Z;
      d.y = d.ay = ZONE_TOP + uy * Z;
    }
    for (let it = 0; it < 600; it++) {
      for (const d of air) {
        d.x += (d.ax - d.x) * 0.006;
        d.y += (d.ay - d.y) * 0.006;
        // Each point outside the outline nudges the circle away from that side.
        for (const p of pointsOf(d)) {
          if (polygonContains(poly, p)) continue;
          d.x += (cx - p[0]) * 0.012;
          d.y += (cy - p[1]) * 0.012;
        }
      }
      for (const a of air)
        for (const b of air) {
          if (a === b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const min = a.r + b.r + 44; // room for the smaller one's labels
          if (dist < min) {
            const k = (min - dist) / dist / 2;
            a.x -= dx * k;
            a.y -= dy * k;
            b.x += dx * k;
            b.y += dy * k;
          }
        }
    }
    const fits = air.every((d) => pointsOf(d).every((p) => polygonContains(poly, p)));
    if (fits || Z >= 1100) {
      LANDSCAPE.zoneFits = fits;
      LANDSCAPE.zonePoly = poly;
      const minX = Math.min(...poly.map((p) => p[0]));
      const maxX = Math.max(...poly.map((p) => p[0]));
      for (const d of far) {
        d.x = minX - 120 - d.r;
        d.y = ZONE_TOP + LABEL_H + d.r + 30;
      }
      LANDSCAPE.GSD.x = maxX + 130;
      LANDSCAPE.H = Math.max(...poly.map((p) => p[1])) + 50; // + the zone label below its bottom edge
      return;
    }
  }
}
LANDSCAPE.afterLayout = placeInZone;
const SPLIT_MS = 1300;

const reducedNow = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const thousands = (n) => count(Math.round(n / 1000) * 1000);
const pct = (v) => Math.round(v * 100);

export default {
  id: 5,
  navLabel: 'Workers',

  mount(container) {
    const data = raw.scene1_plants;
    const airport = data.plants.filter((p) => p.zone === 'airport');
    const sum = (list, f) => list.reduce((s, p) => s + (f(p) ?? 0), 0);
    const insured = sum(airport, (p) => p.insured_2025);
    const low = sum(airport, (p) => p.est_total_low);
    const high = sum(airport, (p) => p.est_total_high);

    const { el, body } = createScene({
      index: 5,
      title: 'Who are the workers?',
      summary: `Only about ${thousands(insured)} of the ${thousands(low)}–${thousands(high)} airport-zone workers in ${data.year} were insured Foxconn employees. Insured workers get pension, medical, work-injury, unemployment and maternity coverage, and by law their overtime needs their consent and earns 1.5–2× pay.`,
    });
    const second = document.createElement('p');
    second.className = 'scene__summary';
    second.textContent = `Most dispatch workers, ${pct(1 - insured / low)}–${pct(1 - insured / high)}% of the workforce, get none of that, according to CLW. Overtime is built into a flat hourly rate, and turning down hours or quitting early can cost them withheld wages or their rebate. An injury, illness or end-of-season layoff falls on them alone.`;
    // The two paragraphs side by side, so the drawing keeps its height.
    const first = el.querySelector('.scene__summary');
    const pair = document.createElement('div');
    pair.className = 'workers-summary';
    first.replaceWith(pair);
    pair.append(first, second);
    el.classList.add('workers-scene');

    const comparisonName = data.comparison.label.replace(/\s+students.*$/i, '');
    const { figure, svg, crossCheckText } = renderPlants(el, body, data, {
      geometry: LANDSCAPE,
      legendBelow: true,
      hint: false,
      crossCheck: false,
      clickable: false,
      legendItems: ({ blue, orange, red, green, grey }) => [
        { kind: 'solid', color: blue, opacity: 0.6, label: 'Insured' },
        { kind: 'solid', color: orange, opacity: 0.6, label: 'Dispatch — low end' },
        { kind: 'hatch', color: grey, label: 'Dispatch — high end' },
        { kind: 'ring', color: red, label: 'Legal line (dispatch ≤ 10%)' },
        { kind: 'solid', color: green, label: `${comparisonName} students` },
      ],
    });
    figure.classList.add('workers-figure');
    figure.dataset.zone = `${Math.round(Math.max(...LANDSCAPE.zonePoly.map((p) => p[0])) - Math.min(...LANDSCAPE.zonePoly.map((p) => p[0])))} ${LANDSCAPE.zoneFits}`;
    svg.attr('preserveAspectRatio', 'xMidYMid meet'); // centred in the page width

    addMethodNote(el, 'How we estimated these numbers', [
      data.method,
      `Dispatch range: ${data.clw_dispatch_source}`,
      `FII Precision: no CLW figure, so it borrows the airport zone's low-end dispatch share as an assumption.`,
      `Legal cap: ${data.legal_cap_source}`,
      `Placement: ${data.placement} The map is turned (see the compass) so the four plants fit one screen; circles are spaced apart, so distances are schematic. The opening circle is all four plants together.`,
      crossCheckText,
      `${data.comparison.label}: ${data.comparison.source}`,
    ]);
    addCaveat(el, data.caveat);
    container.replaceChildren(el);

    // --- fit: the whole screen in one window --------------------------------
    const node = svg.node();
    const fit = () => {
      if (!figure.isConnected) return window.removeEventListener('resize', fit);
      node.style.maxHeight = '';
      const r = node.getBoundingClientRect();
      const section = figure.closest('.scene');
      const rootPad = parseFloat(getComputedStyle(section.parentElement).paddingBottom) || 0;
      const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      const below = section.getBoundingClientRect().bottom - r.bottom + rootPad + bodyPad;
      node.style.maxHeight = `${Math.max(280, window.innerHeight - (r.top + window.scrollY) - below - 2)}px`;
      // Text in the drawing is set in screen px through its scale.
      const rr = node.getBoundingClientRect();
      const vbW = node.viewBox.baseVal?.width || LANDSCAPE.W;
      node.style.setProperty('--wk-s', String(Math.min(rr.width / vbW, rr.height / LANDSCAPE.H)));
    };
    window.addEventListener('resize', fit);
    requestAnimationFrame(fit);
    document.fonts?.ready.then(fit);

    // --- opening: all four plants as one circle, then the split ---------------
    const rOf = scaleSqrt()
      .domain([0, max(data.plants, (d) => d.est_total_high ?? d.est_total_low)])
      .range([0, MAX_R]);
    const all = data.plants;
    const tot = {
      insured: sum(all, (p) => p.insured_2025),
      low: sum(all, (p) => p.est_total_low),
      high: sum(all, (p) => p.est_total_high ?? p.est_total_low),
      cap: sum(all, (p) => p.legal_regular_floor_low),
    };
    const cx = (LANDSCAPE.BOX.x0 + LANDSCAPE.BOX.x1) / 2;
    const cy = (LANDSCAPE.BOX.y0 + LANDSCAPE.BOX.y1) / 2 + 12;
    const paint = {
      blue: getComputedStyle(document.documentElement).getPropertyValue('--color-regular').trim(),
      orange: getComputedStyle(document.documentElement).getPropertyValue('--color-dispatch').trim(),
      red: getComputedStyle(document.documentElement).getPropertyValue('--color-legal-cap').trim(),
    };
    // All four plants added together, in the shape each plant's card expects.
    const both = (f, g) => sum(all, (p) => f(p) ?? (g ? g(p) : 0));
    const T = {
      name: `All ${all.length} plants`,
      zone_label: 'Airport zone and Economic-Technological Development Zone',
      insured_2025: tot.insured,
      est_total_low: tot.low,
      est_total_high: tot.high,
      est_dispatch_low: both((p) => p.est_dispatch_low),
      est_dispatch_high: both((p) => p.est_dispatch_high, (p) => p.est_dispatch_low),
      legal_regular_floor_low: tot.cap,
      legal_max_dispatch_low: both((p) => p.legal_max_dispatch_low),
      legal_max_dispatch_high: both((p) => p.legal_max_dispatch_high, (p) => p.legal_max_dispatch_low),
      dispatch_over_cap_low: both((p) => p.dispatch_over_cap_low),
      dispatch_over_cap_high: both((p) => p.dispatch_over_cap_high, (p) => p.dispatch_over_cap_low),
    };
    T.dispatch_share_of_plant_low = T.est_dispatch_low / T.est_total_low;
    T.dispatch_share_of_plant_high = T.est_dispatch_high / T.est_total_high;

    const tip = createTooltip(figure);
    const scale = () => {
      const r = node.getBoundingClientRect();
      return Math.min(r.width / LANDSCAPE.W, r.height / LANDSCAPE.H);
    };
    const combo = svg.insert('g', 'g.plant').attr('class', 'workers-combined').attr('transform', `translate(${cx}, ${cy})`);
    const layers = [];
    const ring = (key, r0, r1, fill, op, card) => {
      const c = combo.append('circle').attr('r', (r0 + r1) / 2).attr('fill', 'none').attr('stroke', fill).attr('stroke-width', Math.max(0.5, r1 - r0)).attr('opacity', op).style('pointer-events', 'stroke');
      layers.push({ c, op, card, r: r1 });
    };
    ring('high', rOf(tot.low), rOf(tot.high), 'url(#hatch-high)', 1, () =>
      layerCard(T.name, 'Dispatch — high end', count(T.est_dispatch_high), `${percent(T.dispatch_share_of_plant_high)} of the workforce; ${count(T.est_dispatch_high - T.est_dispatch_low)} more than the low end.`, data.sources_short.dispatch)
    );
    ring('low', rOf(tot.insured), rOf(tot.low), paint.orange, 0.7, () =>
      layerCard(T.name, 'Dispatch — low end (default)', count(T.est_dispatch_low), `${percent(T.dispatch_share_of_plant_low)} of the workforce.`, data.sources_short.dispatch)
    );
    combo.append('circle').attr('r', rOf(tot.cap)).attr('fill', 'none').attr('stroke', paint.red).attr('stroke-width', 1.25).attr('pointer-events', 'none');
    const capHit = combo.append('circle').attr('r', rOf(tot.cap)).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 16).style('pointer-events', 'stroke');
    layers.push({ c: capHit, op: null, card: () => layerCard(T.name, 'Legal line — regular workers needed', count(T.legal_regular_floor_low), `Needed for dispatch ≤ 10%. ${count(T.dispatch_over_cap_low)} dispatch over the cap.`, data.sources_short.legal_cap), r: rOf(tot.cap) });
    const core = combo.append('circle').attr('r', rOf(tot.insured)).attr('fill', paint.blue).attr('opacity', 0.7);
    layers.push({ c: core, op: 0.7, card: () => layerCard(T.name, 'Insured (measured)', count(T.insured_2025), null, data.sources_short.insured), r: rOf(tot.insured) });
    for (const L of layers) {
      L.c.on('pointerenter', (event) => {
        for (const M of layers) if (M.op != null) M.c.attr('opacity', M === L ? Math.min(1, M.op + 0.2) : 0.15);
        tip.showOutside(L.card(), event, layers[0].c.node());
      }).on('pointermove', (event) => tip.showOutside(L.card(), event, layers[0].c.node())).on('pointerleave', () => {
        for (const M of layers) if (M.op != null) M.c.attr('opacity', M.op);
        tip.hide();
      });
    }
    const nameT = combo.append('text').attr('class', 'plant__name').attr('y', -rOf(tot.high) - 24).attr('text-anchor', 'middle').text(T.name);
    const valT = combo
      .append('text')
      .attr('class', 'plant__value')
      .attr('y', -rOf(tot.high) - 8)
      .attr('text-anchor', 'middle')
      .text(`${count(tot.low)}–${count(tot.high)} est. · click to see each plant`);
    for (const t of [nameT, valT]) t.on('pointerenter', (event) => tip.showBeside(combinedCard(T), event)).on('pointerleave', () => tip.hide());
    combo.style('cursor', 'pointer').attr('tabindex', 0).attr('role', 'button').attr('aria-label', `${T.name}: ${count(tot.insured)} insured of ${count(tot.low)}–${count(tot.high)} estimated workers. Press Enter to split into the four plants.`);

    // Keep the circles centred in the figure: the viewBox is cropped to the
    // drawing's own extent (plants or the combined circle, Harvard, compass).
    const vb = { x: 0, w: LANDSCAPE.W };
    const extent = (split) => {
      const xs = [];
      const add = (x, r) => xs.push(x - r - 70, x + r + 70); // room for the labels
      if (split) svg.selectAll('g.plant').each((d) => add(d.x, d.r));
      else add(cx, rOf(tot.high));
      add(LANDSCAPE.GSD.x, rOf(data.comparison.value));
      if (split) xs.push(Math.min(...svg.selectAll('g.plant').data().map((d) => d.x - d.r)) - 70);
      return [Math.min(...xs), Math.max(...xs)];
    };
    function centre(split, animate = true) {
      const [x0, x1] = extent(split);
      const to = { x: x0, w: x1 - x0 };
      const from = { ...vb };
      const t0 = performance.now();
      const step = (now) => {
        const k = animate ? Math.min(1, (now - t0) / SPLIT_MS) : 1;
        const e = easeCubicInOut(k);
        vb.x = from.x + (to.x - from.x) * e;
        vb.w = from.w + (to.w - from.w) * e;
        svg.attr('viewBox', `${vb.x} 0 ${vb.w} ${LANDSCAPE.H}`);
        fit();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    centre(reducedNow(), false);

    // After the split: the airport zone's traced outline (the Size screen's
    // Google Earth polygon), stretched to hold the
    // three airport plants and their labels; FII Precision stays outside.
    const zoneData = svg.selectAll('g.plant').data().filter((d) => d.plant.zone === 'airport');
    const box = {
      x0: Math.min(...zoneData.map((d) => d.x - d.r)) - 24,
      x1: Math.max(...zoneData.map((d) => d.x + d.r)) + 24,
      y0: Math.min(...zoneData.map((d) => d.y - d.r - 40)) - 6, // labels above each circle
      y1: Math.max(...zoneData.map((d) => d.y + d.r)) + 26,
    };
    const fitted = LANDSCAPE.zonePoly;
    box.x0 = Math.min(...fitted.map((p) => p[0]));
    box.x1 = Math.max(...fitted.map((p) => p[0]));
    box.y1 = Math.max(...fitted.map((p) => p[1]));
    // Label inside the outline, just above its bottom edge, below the plants.
    // The label runs along the outline's long bottom edge, just outside it.
    const labelPt = (() => {
      const cyz = fitted.reduce((t, p) => t + p[1], 0) / fitted.length;
      const cxz = fitted.reduce((t, p) => t + p[0], 0) / fitted.length;
      let best = null;
      fitted.forEach((a, k) => {
        const b = fitted[(k + 1) % fitted.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if ((a[1] + b[1]) / 2 > cyz && (!best || len > best.len)) best = { a, b, len };
      });
      const [a, b] = best.a[0] < best.b[0] ? [best.a, best.b] : [best.b, best.a];
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const nx = -(b[1] - a[1]) / best.len;
      const ny = (b[0] - a[0]) / best.len;
      const outward = (cxz - mx) * nx + (cyz - my) * ny > 0 ? -1 : 1; // away from the centre
      return [mx + nx * outward * 30, my + ny * outward * 30, (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI];
    })();
    const zone = svg.insert('g', ':first-child').attr('class', 'workers-zone').attr('opacity', 0);
    zone.append('path').attr('d', `M${fitted.map((p) => p.join(',')).join('L')}Z`);
    zone
      .append('text')
      .attr('class', 'workers-zone__label')
      .attr('x', labelPt[0])
      .attr('y', labelPt[1])
      .attr('transform', `rotate(${labelPt[2]}, ${labelPt[0]}, ${labelPt[1]})`)
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle')
      .text(zoneData[0].plant.zone_label);

    const plants = svg.selectAll('g.plant');
    const extras = svg.selectAll('.annotation');
    const finalT = (d) => `translate(${d.x}, ${d.y})`;
    const startT = (d) => `translate(${cx + (d.x - cx) * 0.15}, ${cy + (d.y - cy) * 0.15}) scale(0.4)`;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      combo.remove();
      zone.attr('opacity', 1);
      return;
    }
    // Not drawn at all until the split: their rings use pointer-events: stroke,
    // which ignores visibility, so only display:none keeps them from catching
    // the combined circle's hover and click.
    plants.attr('transform', startT).attr('opacity', 0).style('display', 'none');
    extras.attr('opacity', 0);

    const split = () => {
      if (!figure.isConnected) return;
      combo
        .transition()
        .duration(SPLIT_MS * 0.6)
        .ease(easeCubicInOut)
        .attr('opacity', 0)
        .attr('transform', `translate(${cx}, ${cy}) scale(0.85)`)
        .remove();
      plants
        .style('display', null)
        .transition()
        .duration(SPLIT_MS)
        .ease(easeCubicInOut)
        .attr('transform', finalT)
        .attr('opacity', 1)
;
      extras.transition().delay(SPLIT_MS * 0.7).duration(400).attr('opacity', 1);
      zone.transition().delay(SPLIT_MS * 0.8).duration(600).attr('opacity', 1);
      // Harvard moves up to the plants' vertical centre.
      const ys = svg.selectAll('g.plant').data().map((d) => d.y);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      svg.select('g.comparison').transition().duration(SPLIT_MS).ease(easeCubicInOut).attr('transform', `translate(${LANDSCAPE.GSD.x}, ${midY})`);
      setTimeout(() => centre(true), SPLIT_MS * 0.3);
    };
    let didSplit = false;
    const go = () => {
      if (didSplit) return;
      didSplit = true;
      tip.hide();
      combo.style('pointer-events', 'none');
      split();
    };
    combo.on('click', go).on('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        go();
      }
    });
  },
};
