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
import { createTooltip } from '../lib/tooltip.js';
import { colorFor } from '../lib/colorTokens.js';
import { count, percent } from '../lib/format.js';
import { raw } from '../lib/dataLoader.js';

// Labor Scene 1's portrait layout (north up). The Introduction reuses this
// drawing in a landscape layout, turned so it fits one window (see intro).
const PORTRAIT = { W: 1060, H: 940, BOX: { x0: 200, x1: 740, y0: 210, y1: 740 }, GSD: { x: 952, y: 824 }, angle: 0, compass: [988, 150] };
const MAX_R = 150;
const PAD = 36; // room for the two label lines that sit above each circle
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

function layout(plants, rOf, gsdR, G) {
  const { W, H, BOX, GSD } = G;
  const projection = geoMercator()
    .angle(G.angle) // turned in the Introduction so the far plant sits beside, not above
    .fitExtent(
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
  // Optional: a page can re-place the circles itself (the Introduction puts
  // the airport plants inside the zone's outline).
  if (G.afterLayout) {
    G.afterLayout(nodes);
    return nodes;
  }
  // Optional: push the plant outside the airport zone further out, so it reads
  // as a separate site (its direction is kept; the distance is schematic).
  if (G.farShift) {
    const air = nodes.filter((d) => d.plant.zone === 'airport');
    const ax = air.reduce((s, d) => s + d.x, 0) / air.length;
    const ay = air.reduce((s, d) => s + d.y, 0) / air.length;
    for (const d of nodes) {
      if (d.plant.zone === 'airport') continue;
      const len = Math.hypot(d.x - ax, d.y - ay) || 1;
      d.x += ((d.x - ax) / len) * G.farShift;
      d.y += ((d.y - ay) / len) * G.farShift;
      d.y = Math.min(Math.max(d.y, d.r + PAD + 8), H - d.r - 40);
    }
  }
  return nodes;
}

export function layerCard(plantName, label, value, note, source) {
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
  if (source) {
    const src = document.createElement('p');
    src.className = 'tooltip__note tooltip__source';
    src.textContent = source;
    wrap.append(src);
  }
  return wrap;
}

export function combinedCard(plant) {
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
    // Short labels so each row is one line; ranges read low–high.
    ['Insured', count(plant.insured_2025)],
    ['Dispatch (est.)', range(plant.est_dispatch_low, plant.est_dispatch_high, count)],
    ['Total (est.)', range(plant.est_total_low, plant.est_total_high, count)],
    ['Dispatch share', range(plant.dispatch_share_of_plant_low, plant.dispatch_share_of_plant_high, percent)],
    ['Legal max (10%)', range(plant.legal_max_dispatch_low, plant.legal_max_dispatch_high, count)],
    ['Over the cap', range(plant.dispatch_over_cap_low, plant.dispatch_over_cap_high, count)],
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
      // Short form of the plant's note (the full one is in the method note).
      plant.note ? 'Outside CLW\'s survey area; dispatch share assumed.' : null,
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

// Draws the plants figure into `body` (legend, hint, figure) for the
// Introduction's last screen; `opts` sets the layout.
export function renderPlants(el, body, data, opts = {}) {
    const G = opts.geometry ?? PORTRAIT;
    const { W, H, GSD } = G;
    const blue = colorFor('regular');
    const orange = colorFor('dispatch');
    const red = colorFor('legal-cap');
    const green = colorFor('comparison');
    const grey = colorFor('estimate-range');

    const legendEl = legend(
      opts.legendItems ? opts.legendItems({ blue, orange, red, green, grey }) : [
        { kind: 'solid', color: blue, opacity: 0.6, label: 'Insured (measured)' },
        { kind: 'solid', color: orange, opacity: 0.6, label: `Dispatch — low end (default, ${count(data.clw_dispatch_range.low)} campus-wide)` },
        { kind: 'hatch', color: grey, label: `Dispatch — high-end extra (up to ${count(data.clw_dispatch_range.high)} campus-wide)` },
        { kind: 'ring', color: red, label: 'Legal line — regular ≥ 90% (dispatch ≤ 10%)' },
        { kind: 'solid', color: green, label: data.comparison.label, value: count(data.comparison.value) },
      ]
    );
    if (!opts.legendBelow) body.append(legendEl);

    const hint = document.createElement('p');
    hint.className = 'figure__hint';
    hint.textContent =
      'Hover a ring for that value alone; hover the plant name for the full breakdown. Click a plant to break it into workers on the floor.';
    if (opts.hint !== false) body.append(hint);

    const figure = document.createElement('figure');
    figure.className = 'figure';
    body.append(figure);

    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMinYMin meet')
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

    const nodes = layout(data.plants, rOf, rOf(data.comparison.value), G);
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
      const to = Math.max(from + 40, span - (G.annotStop ?? 215)); // stop clear of the cluster's labels
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
        .attr('x', tx + (G.annotDx ?? 10))
        .attr('y', ty + (G.annotDy ?? 0))
        .attr('text-anchor', G.annotAnchor ?? 'start')
        .attr('dominant-baseline', 'middle')
        .attr('transform', G.annotAlong ? `rotate(${(angle * 180) / Math.PI + (Math.abs(angle) > Math.PI / 2 ? 180 : 0)}, ${tx + (G.annotDx ?? 10)}, ${ty + (G.annotDy ?? 0)})` : null)
        .attr('class', 'annotation__text')
        .text(`≈ ${Math.round(km)} km ${compassDirection(origin, away.plant)}`);
    }

    // North reference, since the circles are placed by direction.
    // (turned with the layout, so it still points to true north)
    // 'left': just left of the leftmost circle.
    const compassX = G.compass[0] === 'left' ? Math.min(...nodes.map((n) => n.x - n.r)) - 46 : G.compass[0];
    const compassAt = svg.append('g').attr('class', 'annotation').attr('transform', `translate(${compassX}, ${G.compass[1]})`);
    const compass = compassAt.append('g').attr('transform', `rotate(${-G.angle})`);
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
    const nRad = ((-G.angle - 90) * Math.PI) / 180; // where the arrow points
    compassAt
      .append('text')
      .attr('x', G.angle ? Math.cos(nRad) * 22 : 0)
      .attr('y', G.angle ? Math.sin(nRad) * 22 : 42)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', G.angle ? 'middle' : 'auto')
      .attr('class', 'annotation__text')
      .text('N');

    const groups = svg
      .selectAll('g.plant')
      .data(nodes)
      .join('g')
      .attr('class', 'plant')
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .attr('tabindex', 0)
      .attr('role', 'img')
      .attr('aria-label', (d) => `${d.plant.name}: ${count(d.plant.insured_2025)} insured, ${count(d.plant.est_total_low)} estimated total.`)
      // Read by the circles → floor transition to break each circle into its own dots.
      .attr('data-plant-id', (d) => d.plant.id)
      .attr('data-r-insured', (d) => rOf(d.plant.insured_2025))
      .attr('data-r-low', (d) => rOf(d.plant.est_total_low));

    const scaleAt = () => {
      const r = svg.node().getBoundingClientRect();
      return Math.min(r.width / W, r.height / H);
    };
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
              `${percent(p.dispatch_share_of_plant_high)} of the workforce; ${count(extra)} more than the low end.`,
              data.sources_short.dispatch
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
              ? `${percent(p.dispatch_share_of_plant_low)} of the workforce.`
              : `${percent(p.dispatch_share_of_plant_low)} of the workforce (assumed, airport-zone share).`,
            data.sources_short.dispatch
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
            `Needed for dispatch ≤ 10%. ${count(p.dispatch_over_cap_low)} dispatch over the cap.`,
            data.sources_short.legal_cap
          ),
        rCap,
        capHit
      );

      addLayer(
        'insured',
        g.append('circle').attr('r', rInsured).attr('fill', blue),
        () => layerCard(p.name, 'Insured (measured)', count(p.insured_2025), null, data.sources_short.insured),
        rInsured
      );

      // The plant's outermost ring: hover cards sit outside it.
      const outerEl = layers[0].vis.node();
      const applyFocus = (focusKey) => {
        for (const L of layers) {
          const op = focusKey == null ? BASE_OPACITY[L.key] : L.key === focusKey ? EMPH_OPACITY[L.key] : FADED_OPACITY;
          L.vis.attr('opacity', op);
        }
      };
      applyFocus(null);

      for (const L of layers) {
        L.hit
          .on('pointerenter', (event) => {
            applyFocus(L.key);
            tooltip.showOutside(L.card(), event, outerEl);
          })
          .on('pointermove', (event) => tooltip.showOutside(L.card(), event, outerEl))
          .on('pointerleave', () => {
            applyFocus(null);
            tooltip.hide();
          });
      }
    });

    const nameLabel = groups
      .append('text')
      .attr('class', 'plant__name')
      // Above the value line by its own height, so the pair never overlaps
      // whatever size the page sets the text at.
      .attr('y', (d) => -d.r - 8)
      .attr('dy', '-1.25em')
      .attr('text-anchor', 'middle')
      .text((d) => d.plant.name);
    const valueLabel = groups
      .append('text')
      .attr('class', 'plant__value')
      .attr('y', (d) => -d.r - 8)
      .attr('text-anchor', 'middle')
      .text((d) => `${count(d.plant.est_total_low)} est.`);

    const showCombined = (d) => tooltip.show(combinedCard(d.plant), showAt(d.x, d.y - d.r));
    const showCombinedBeside = (event, d) => tooltip.showBeside(combinedCard(d.plant), event);
    nameLabel.on('pointerenter', showCombinedBeside).on('pointerleave', () => tooltip.hide());
    valueLabel.on('pointerenter', showCombinedBeside).on('pointerleave', () => tooltip.hide());
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
      .attr('y', -rOf(data.comparison.value) - 8)
      .attr('dy', '-1.25em')
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
    if (opts.crossCheck !== false) figure.append(crossCheck);
    if (opts.legendBelow) figure.append(legendEl);
    return { figure, svg, crossCheckText: crossCheck.textContent };

}
