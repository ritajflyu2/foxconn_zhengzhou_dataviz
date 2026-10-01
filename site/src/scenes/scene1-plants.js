import {
  select,
  scaleSqrt,
  max,
  geoMercator,
  geoDistance,
  forceSimulation,
  forceCollide,
  forceX,
  forceY,
} from 'd3';
import { createScene, addCaveat, addMethodNote } from '../lib/sceneShell.js';
import { createTooltip } from '../lib/tooltip.js';
import { colorFor } from '../lib/colorTokens.js';
import { count, percent } from '../lib/format.js';
import { raw } from '../lib/dataLoader.js';

const W = 1060;
const H = 940;
const MAX_R = 150;
const PAD = 36; // room for the two label lines that sit above each circle
const BOX = { x0: 200, x1: 740, y0: 210, y1: 740 };
const GSD = { x: 952, y: 824 };
const EARTH_KM = 6371;
const CAP_HIT_WIDTH = 16; // generous invisible hit-stroke so the thin red ring is easy to hover

// Deterministic layout: d3-force only reaches for randomness to break exact
// ties, but seeding it keeps the picture identical on every load.
function seededRandom(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function compassDirection(from, to) {
  const ns = to.lat > from.lat ? 'north' : 'south';
  const ew = to.lon > from.lon ? 'east' : 'west';
  return `${ns}-${ew}`;
}

function outerRadius(plant, rOf) {
  return rOf(plant.est_total_high ?? plant.est_total_low);
}

function layout(plants, rOf, gsdR) {
  const projection = geoMercator().fitExtent(
    [
      [BOX.x0, BOX.y0],
      [BOX.x1, BOX.y1],
    ],
    {
      type: 'FeatureCollection',
      features: plants.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    }
  );

  // The three airport plants sit within ~1.5 km of each other while their
  // circles are hundreds of pixels wide, so true geography cannot be drawn at
  // this size. Seed each circle at its projected point, then relax overlaps:
  // relative direction survives, absolute distance does not. The storyboard
  // calls this "loosely but roughly geographically"; the annotation and the
  // method note both say the spacing is schematic.
  const nodes = plants.map((p) => {
    const [x, y] = projection([p.lon, p.lat]);
    return { plant: p, r: outerRadius(p, rOf), x, y, anchorX: x, anchorY: y };
  });

  // The comparison marker holds its corner, so plants have to make room for it.
  const obstacle = { plant: null, r: gsdR + 54, x: GSD.x, y: GSD.y, fx: GSD.x, fy: GSD.y };

  const clamp = () => {
    for (const d of nodes) {
      d.x = Math.min(Math.max(d.x, d.r + 10), W - d.r - 10);
      d.y = Math.min(Math.max(d.y, d.r + PAD + 8), H - d.r - 40);
    }
  };

  forceSimulation([...nodes, obstacle])
    .randomSource(seededRandom())
    .force('x', forceX((d) => d.anchorX ?? d.x).strength(0.05))
    .force('y', forceY((d) => d.anchorY ?? d.y).strength(0.05))
    .force('collide', forceCollide((d) => d.r + PAD).strength(1).iterations(6))
    // Clamping inside the loop lets collide resolve against the edges instead
    // of being squashed into an overlap by a clamp applied once at the end.
    .force('bounds', clamp)
    .stop()
    .tick(600);

  clamp();
  return nodes;
}

function layerCard(plantName, label, value, note) {
  const wrap = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'tooltip__title';
  title.textContent = plantName;
  const sub = document.createElement('p');
  sub.className = 'tooltip__sub';
  sub.textContent = label;
  const val = document.createElement('p');
  val.className = 'tooltip__single-value';
  val.textContent = value;
  wrap.append(title, sub, val);
  if (note) {
    const n = document.createElement('p');
    n.className = 'tooltip__note';
    n.textContent = note;
    wrap.append(n);
  }
  return wrap;
}

function combinedCard(plant) {
  const wrap = document.createElement('div');

  const title = document.createElement('p');
  title.className = 'tooltip__title';
  title.textContent = plant.name;

  const sub = document.createElement('p');
  sub.className = 'tooltip__sub';
  sub.textContent = plant.zone_label;

  const range = (lo, hi, fmt) =>
    hi != null ? `${fmt(lo)}–${fmt(hi)}` : fmt(lo);
  const hasRange = plant.est_total_high != null;

  const list = document.createElement('dl');
  const rows = [
    ['Insured (measured)', count(plant.insured_2025)],
    [
      hasRange ? 'Estimated dispatch (low–high)' : 'Estimated dispatch',
      range(plant.est_dispatch_low, plant.est_dispatch_high, count),
    ],
    [
      hasRange ? 'Estimated total (low–high)' : 'Estimated total',
      range(plant.est_total_low, plant.est_total_high, count),
    ],
    [
      hasRange ? 'Dispatch share of this plant (low–high)' : 'Dispatch share of this plant',
      range(plant.dispatch_share_of_plant_low, plant.dispatch_share_of_plant_high, percent),
    ],
    [
      hasRange ? 'Legal max dispatch — 10% (low–high)' : 'Legal max dispatch — 10%',
      range(plant.legal_max_dispatch_low, plant.legal_max_dispatch_high, count),
    ],
    [
      hasRange ? 'Dispatch over the legal cap (low–high)' : 'Dispatch over the legal cap',
      range(plant.dispatch_over_cap_low, plant.dispatch_over_cap_high, count),
    ],
  ];
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }

  wrap.append(title, sub, list);

  if (plant.location_approximate || plant.note) {
    const note = document.createElement('p');
    note.className = 'tooltip__note';
    note.textContent = [
      plant.note,
      plant.location_approximate ? 'Location approximate.' : null,
    ]
      .filter(Boolean)
      .join(' ');
    wrap.append(note);
  }

  return wrap;
}

function legend(items) {
  const el = document.createElement('ul');
  el.className = 'legend';

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'legend__item';

    const swatch = document.createElement('span');
    swatch.className = `legend__swatch legend__swatch--${item.kind}`;
    if (item.kind === 'ring') swatch.style.borderColor = item.color;
    else if (item.kind === 'hatch') swatch.style.setProperty('--hatch', item.color);
    else {
      swatch.style.background = item.color;
      if (item.opacity != null) swatch.style.opacity = item.opacity;
    }

    const label = document.createElement('span');
    label.textContent = item.label;

    li.append(swatch, label);
    if (item.value) {
      const value = document.createElement('span');
      value.className = 'legend__value';
      value.textContent = item.value;
      li.append(value);
    }
    el.append(li);
  }

  return el;
}

export default {
  id: 1,
  navLabel: 'Zoom out',
  colorKey: 'regular',

  mount(container, data) {
    const { el, body } = createScene({
      index: 1,
      title: 'Zoom out: where the workers are',
      summary:
        'One circle per plant, sized by estimated total workforce. The solid blue core is the regular workers we can actually count; the solid orange band is the default (low-end) dispatch estimate; the hatched grey band outside it is how much bigger the plant could be at CLW’s high end. The law caps dispatch at 10% of the workforce, so regular workers should reach the red line (90% of the total) — the blue core falls far short, and the wide gap out to the red line is dispatch filling jobs the law reserves for regular staff.',
    });

    const blue = colorFor('regular');
    const orange = colorFor('dispatch');
    const red = colorFor('legal-cap');
    const green = colorFor('comparison');
    const grey = colorFor('estimate-range');

    body.append(
      legend([
        { kind: 'solid', color: blue, opacity: 0.6, label: 'Insured (measured)' },
        { kind: 'solid', color: orange, opacity: 0.6, label: `Dispatch — low end (default, ${count(data.clw_dispatch_range.low)} campus-wide)` },
        { kind: 'hatch', color: grey, label: `Dispatch — high-end extra (up to ${count(data.clw_dispatch_range.high)} campus-wide)` },
        { kind: 'ring', color: red, label: 'Legal line — regular ≥ 90% (dispatch ≤ 10%)' },
        { kind: 'solid', color: green, label: data.comparison.label, value: count(data.comparison.value) },
      ])
    );

    const hint = document.createElement('p');
    hint.className = 'figure__hint';
    hint.textContent = 'Hover a ring for that value alone; hover the plant name for the full breakdown.';
    body.append(hint);

    const figure = document.createElement('figure');
    figure.className = 'figure';
    body.append(figure);

    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr('aria-label', 'Four Foxconn Zhengzhou plants drawn as nested circles sized by estimated workforce');

    // The high-end (uncertain) layer is a dashed hatch; the low-end default is a
    // solid fill. Base opacity per layer; on hover the hovered layer stays at
    // emphasis and the rest fade, so no stroke effect is needed.
    const defs = svg.append('defs');
    const hp = defs
      .append('pattern')
      .attr('id', 'hatch-high')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 8)
      .attr('height', 8)
      .attr('patternTransform', 'rotate(45)');
    hp.append('rect').attr('width', 8).attr('height', 8).attr('fill', grey).attr('fill-opacity', 0.12);
    hp.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 8).attr('stroke', grey).attr('stroke-width', 2);
    const hatchHigh = 'url(#hatch-high)';

    const STROKE_W = 1.25; // width of the red legal-cap line (the only outlined circle)
    const BASE_OPACITY = { high: 1, low: 0.7, cap: 1, insured: 0.7 };
    const EMPH_OPACITY = { high: 1, low: 0.9, cap: 1, insured: 0.9 };
    const FADED_OPACITY = 0.15;

    const rOf = scaleSqrt()
      .domain([0, max(data.plants, (d) => d.est_total_high ?? d.est_total_low)])
      .range([0, MAX_R]);

    const nodes = layout(data.plants, rOf, rOf(data.comparison.value));
    const tooltip = createTooltip(figure);

    // Distance annotation: the one geographic fact the relaxed layout loses.
    const airport = nodes.filter((n) => n.plant.zone === 'airport');
    const away = nodes.find((n) => n.plant.zone !== 'airport');
    if (airport.length && away) {
      const origin = {
        lat: airport.reduce((s, n) => s + n.plant.lat, 0) / airport.length,
        lon: airport.reduce((s, n) => s + n.plant.lon, 0) / airport.length,
      };
      const km = geoDistance([origin.lon, origin.lat], [away.plant.lon, away.plant.lat]) * EARTH_KM;
      const cx = airport.reduce((s, n) => s + n.x, 0) / airport.length;
      const cy = airport.reduce((s, n) => s + n.y, 0) / airport.length;
      const angle = Math.atan2(cy - away.y, cx - away.x);
      const span = Math.hypot(cx - away.x, cy - away.y);
      const from = away.r + 12;
      const to = Math.max(from + 40, span - 215); // stop clear of the cluster's labels
      const at = (d) => [away.x + Math.cos(angle) * d, away.y + Math.sin(angle) * d];
      const [x1, y1] = at(from);
      const [x2, y2] = at(to);
      const [tx, ty] = at((from + to) / 2);

      const annot = svg.append('g').attr('class', 'annotation');
      annot
        .append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', 'currentColor')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 5');
      annot
        .append('text')
        .attr('x', tx + 10)
        .attr('y', ty)
        .attr('dominant-baseline', 'middle')
        .attr('class', 'annotation__text')
        .text(`≈ ${Math.round(km)} km ${compassDirection(origin, away.plant)}`);
    }

    // North reference, since the circles are placed by direction.
    const compass = svg.append('g').attr('class', 'annotation').attr('transform', 'translate(988, 150)');
    compass
      .append('line')
      .attr('y1', 26)
      .attr('y2', -6)
      .attr('stroke', 'currentColor')
      .attr('stroke-width', 1);
    compass
      .append('path')
      .attr('d', 'M -4 2 L 0 -8 L 4 2 Z')
      .attr('fill', 'currentColor');
    compass
      .append('text')
      .attr('y', 42)
      .attr('text-anchor', 'middle')
      .attr('class', 'annotation__text')
      .text('N');

    const groups = svg
      .selectAll('g.plant')
      .data(nodes)
      .join('g')
      .attr('class', 'plant')
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) =>
        `${d.plant.name}: ${count(d.plant.insured_2025)} insured, ${count(d.plant.est_total_low)} estimated total`
      );

    const scaleAt = () => figure.getBoundingClientRect().width / W;
    const showAt = (x, y) => ({ x: x * scaleAt(), y: y * scaleAt() });

    // A worker band is the ring between two radii — dispatch is literally the
    // space between the insured circle and the total circle. Draw each band as a
    // thick stroke on its mid-radius so it is its own shape: hovering highlights
    // only that ring, and the fade leaves the other rings dim. No outline.
    const band = (g, rInner, rOuter, paint) =>
      g
        .append('circle')
        .attr('r', (rInner + rOuter) / 2)
        .attr('fill', 'none')
        .attr('stroke', paint)
        .attr('stroke-width', Math.max(0.5, rOuter - rInner))
        .style('pointer-events', 'stroke');

    groups.each(function (d) {
      const g = select(this);
      const p = d.plant;
      const rLow = rOf(p.est_total_low);
      const rHigh = p.est_total_high != null ? rOf(p.est_total_high) : rLow;
      const rCap = rOf(p.legal_regular_floor_low);
      const rInsured = rOf(p.insured_2025);

      // Each layer in draw order (bottom first). Hovering one keeps it at its
      // base/emphasis opacity and fades the others — no stroke change. The cap
      // has a separate transparent hit-ring (the red line is too thin to hover).
      const layers = [];
      const addLayer = (key, vis, card, anchorR, hit = vis) => {
        layers.push({ key, vis, card, anchorR, hit });
        return vis;
      };

      if (p.est_total_high != null) {
        const extra = p.est_dispatch_high - p.est_dispatch_low;
        addLayer(
          'high',
          band(g, rLow, rHigh, hatchHigh),
          () =>
            layerCard(
              p.name,
              'Dispatch — high end',
              count(p.est_dispatch_high),
              `At CLW's high end, dispatch rises to ${count(p.est_dispatch_high)} (${percent(
                p.dispatch_share_of_plant_high
              )} of the workforce). This grey band is the ${count(
                extra
              )} extra dispatch workers above the low estimate, out to a ${count(p.est_total_high)} total.`
            ),
          rHigh
        );
      }

      addLayer(
        'low',
        band(g, rInsured, rLow, orange),
        () =>
          layerCard(
            p.name,
            'Dispatch — low end (default)',
            count(p.est_dispatch_low),
            p.clw_share_of_airport_dispatch != null
              ? `The band between the insured core and the low-end total (${count(
                  p.est_total_low
                )}): ${count(p.est_dispatch_low)} dispatch, ${percent(
                  p.dispatch_share_of_plant_low
                )} of the workforce. (This plant's slice of CLW's campus-wide ${count(data.clw_dispatch_range.low)} estimate.)`
              : `The band between the insured core and the total (${count(p.est_total_low)}): ${count(
                  p.est_dispatch_low
                )} dispatch, ${percent(
                  p.dispatch_share_of_plant_low
                )} of the workforce — the airport zone's low-end share, applied here as an assumption.`
          ),
        rLow
      );

      const capStroke = g
        .append('circle')
        .attr('class', 'cap-stroke')
        .attr('r', rCap)
        .attr('fill', 'none')
        .attr('stroke', red)
        .attr('stroke-width', STROKE_W)
        .attr('pointer-events', 'none');
      const capHit = g
        .append('circle')
        .attr('r', rCap)
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', CAP_HIT_WIDTH)
        .style('pointer-events', 'stroke');
      addLayer(
        'cap',
        capStroke,
        () =>
          layerCard(
            p.name,
            'Legal line — regular workers needed',
            count(p.legal_regular_floor_low),
            `For dispatch to stay within the 10% cap, regular workers must reach 90% of the total — ${count(
              p.legal_regular_floor_low
            )} here. Only ${count(p.insured_2025)} are insured, so ${count(
              p.dispatch_over_cap_low
            )} dispatch workers are over the legal cap (everything between the blue core and this line).`
          ),
        rCap,
        capHit
      );

      addLayer(
        'insured',
        g.append('circle').attr('r', rInsured).attr('fill', blue),
        () => layerCard(p.name, 'Insured (measured)', count(p.insured_2025), 'Work-injury insurance headcount, 2025.'),
        rInsured
      );

      const applyFocus = (focusKey) => {
        for (const L of layers) {
          const op = focusKey == null ? BASE_OPACITY[L.key] : L.key === focusKey ? EMPH_OPACITY[L.key] : FADED_OPACITY;
          L.vis.attr('opacity', op);
        }
      };
      applyFocus(null);

      for (const L of layers) {
        L.hit
          .on('pointerenter', () => {
            applyFocus(L.key);
            tooltip.show(L.card(), showAt(d.x, d.y - L.anchorR));
          })
          .on('pointerleave', () => {
            applyFocus(null);
            tooltip.hide();
          });
      }
    });

    const nameLabel = groups
      .append('text')
      .attr('class', 'plant__name')
      .attr('y', (d) => -d.r - 24)
      .attr('text-anchor', 'middle')
      .text((d) => d.plant.name);
    const valueLabel = groups
      .append('text')
      .attr('class', 'plant__value')
      .attr('y', (d) => -d.r - 8)
      .attr('text-anchor', 'middle')
      .text((d) => `${count(d.plant.est_total_low)} est.`);

    const showCombined = (d) => tooltip.show(combinedCard(d.plant), showAt(d.x, d.y - d.r));
    nameLabel.on('pointerenter', (_e, d) => showCombined(d)).on('pointerleave', () => tooltip.hide());
    valueLabel.on('pointerenter', (_e, d) => showCombined(d)).on('pointerleave', () => tooltip.hide());
    groups
      .on('focus', (_e, d) => showCombined(d))
      .on('blur', () => tooltip.hide());

    // Comparison marker, drawn to the same area scale. Name is derived from the
    // JSON label (text before " students") so nothing is hard-coded.
    const comparisonName = data.comparison.label.replace(/\s+students.*$/i, '');
    const gsd = svg.append('g').attr('class', 'comparison').attr('transform', `translate(${GSD.x}, ${GSD.y})`);
    gsd.append('circle').attr('r', rOf(data.comparison.value)).attr('fill', green);
    gsd
      .append('text')
      .attr('class', 'plant__name')
      .attr('y', -rOf(data.comparison.value) - 24)
      .attr('text-anchor', 'middle')
      .text(comparisonName);
    gsd
      .append('text')
      .attr('class', 'plant__value')
      .attr('y', -rOf(data.comparison.value) - 8)
      .attr('text-anchor', 'middle')
      .text(`${count(data.comparison.value)} students`);

    // Cross-check: airport-zone estimate against CLW's own field estimate.
    const airportLow = data.plants.filter((p) => p.zone === 'airport').reduce((sum, p) => sum + p.est_total_low, 0);
    const airportHigh = data.plants.filter((p) => p.zone === 'airport').reduce((sum, p) => sum + p.est_total_high, 0);
    const clw = raw.scene3_workforce_by_year.years.find((y) => y.year === data.year)?.clw_total;

    const crossCheck = document.createElement('p');
    crossCheck.className = 'figure__note';
    crossCheck.textContent = clw
      ? `Cross-check: the three airport-zone plants come to ${count(airportLow)}–${count(
          airportHigh
        )} estimated workers in ${data.year} — China Labor Watch's own ${
          clw.season_label
        } estimate is ${count(clw.low)}–${count(clw.high)}.`
      : `Cross-check: the three airport-zone plants come to ${count(airportLow)}–${count(airportHigh)} estimated workers in ${data.year}.`;
    figure.append(crossCheck);

    addMethodNote(el, 'How we estimated these numbers', [
      data.method,
      `Dispatch range: ${data.clw_dispatch_source}`,
      `FII Precision: no CLW figure, so it borrows the airport zone's low-end dispatch share (${percent(data.fii_precision_dispatch_share)} of the workforce) as an assumption.`,
      `Legal cap: ${data.legal_cap_source}`,
      `Placement: ${data.placement} Circles are spaced apart so they do not overlap, so distances on screen are schematic.`,
      `${data.comparison.label}: ${data.comparison.source}`,
    ]);

    addCaveat(el, data.caveat);
    container.replaceChildren(el);
  },
};
