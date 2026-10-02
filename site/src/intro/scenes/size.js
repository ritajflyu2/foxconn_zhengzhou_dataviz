import { select } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../introShell.js';
import { cssVar } from '../../lib/colorTokens.js';
import foxconnUrl from '../../../../design/reference/google_earth/cropped/foxconn_cutout.png';
import appleUrl from '../../../../design/reference/google_earth/cropped/apple_cutout.png';
import campusSizes from '../../../data/comparison/campus_sizes.json';

const IMAGES = { 'foxconn_cutout.png': foxconnUrl, 'apple_cutout.png': appleUrl };

// Layout, in SVG units. Both sites share one px-per-meter scale (k), fitted
// so the two outlines plus their dimension-line margins fill the width.
const W = 1000;
const MARGIN_LEFT = 70; // Foxconn's length line + label
const GAP = 150; // between the two sites, holding Apple's length line + label
const MARGIN_RIGHT = 90; // Apple's area text is wider than its outline
const TOP = 70; // titles above the shapes
const DIM_OFFSET = 22; // dimension line distance from the outline
const TICK = 6;
const SCALE_BAR_M = 1000;

const ha = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const acres = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const km2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const ratio = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const distance = (m) => (m >= 1000 ? `≈ ${(m / 1000).toFixed(2)} km` : `≈ ${Math.round(m)} m`);

function dimLine(g, { x1, y1, x2, y2, label, vertical }) {
  const line = g.append('g').attr('class', 'size-dim');
  line.append('line').attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
  const ticks = vertical
    ? [[x1 - TICK, y1, x1 + TICK, y1], [x2 - TICK, y2, x2 + TICK, y2]]
    : [[x1, y1 - TICK, x1, y1 + TICK], [x2, y2 - TICK, x2, y2 + TICK]];
  for (const [a, b, c, d] of ticks) line.append('line').attr('x1', a).attr('y1', b).attr('x2', c).attr('y2', d);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const text = line.append('text').attr('class', 'size-dim__label').attr('text-anchor', 'middle').text(label);
  // Vertical: label to the left, reading bottom-to-top. Horizontal: above the line (callers can move it).
  if (vertical) text.attr('transform', `translate(${mx - 12}, ${my}) rotate(-90)`);
  else text.attr('x', mx).attr('y', y1 - 10);
  return text;
}

export default {
  id: 1,
  navLabel: 'Size',

  mount(container) {
    const fox = { ...campusSizes.foxconn_zhengzhou_airport_zone, ...campusSizes.layout.foxconn_zhengzhou_airport_zone };
    const apple = { ...campusSizes.apple_park, ...campusSizes.layout.apple_park };

    const { el, body } = createScene({
      index: 1,
      title: 'How big is Foxconn Zhengzhou?',
      summary: `The airport-zone campus, Hongfujin, FII Yuzhan, Henan Fuchi and FII Precision together, cut out from Google Earth and drawn at the same scale as Apple Park. It is about ${ratio.format(
        campusSizes.ratio_foxconn_to_apple
      )}× the size.`,
    });

    const outlineColor = cssVar('--color-site-outline');
    const legend = document.createElement('ul');
    legend.className = 'legend';
    for (const item of [
      { swatch: 'size-swatch--outline', label: 'Site outline, traced in Google Earth' },
      { swatch: 'size-swatch--dim', label: 'Rough width and length, from the traced KML outline' },
      { swatch: null, label: 'Both sites drawn to the same scale' },
    ]) {
      const li = document.createElement('li');
      li.className = 'legend__item';
      if (item.swatch) {
        const sw = document.createElement('span');
        sw.className = `size-swatch ${item.swatch}`;
        if (item.swatch === 'size-swatch--outline') sw.style.borderColor = outlineColor;
        li.append(sw);
      }
      const label = document.createElement('span');
      label.textContent = item.label;
      li.append(label);
      legend.append(li);
    }
    body.append(legend);

    // One meters-to-SVG scale for both sites.
    const k = (W - MARGIN_LEFT - GAP - MARGIN_RIGHT) / (fox.width_m + apple.width_m);
    const box = (s) => ({ w: s.outline_bbox_px[2] * s.m_per_px * k, h: s.outline_bbox_px[3] * s.m_per_px * k });
    const fb = box(fox);
    const ab = box(apple);
    const baseY = TOP + Math.max(fb.h, ab.h);
    const foxX = MARGIN_LEFT;
    const appleX = MARGIN_LEFT + fb.w + GAP;
    const H = baseY + 190;

    const figure = document.createElement('figure');
    figure.className = 'figure size-figure';
    body.append(figure);

    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr(
        'aria-label',
        `Foxconn Zhengzhou airport zone, about ${distance(fox.width_m)} by ${distance(fox.length_m)}, next to Apple Park, about ${distance(
          apple.width_m
        )} by ${distance(apple.length_m)}, drawn to the same scale.`
      );

    const site = (s, x, b) => {
      const g = svg.append('g').attr('class', 'size-site');
      const y = baseY - b.h;
      const scale = s.m_per_px * k;
      g.append('image')
        .attr('href', IMAGES[s.image])
        .attr('x', x - s.outline_bbox_px[0] * scale)
        .attr('y', y - s.outline_bbox_px[1] * scale)
        .attr('width', s.image_px[0] * scale)
        .attr('height', s.image_px[1] * scale);
      return { g, x, y, w: b.w, h: b.h };
    };

    const F = site(fox, foxX, fb);
    const A = site(apple, appleX, ab);

    // Titles, one row across the top.
    for (const [S, name] of [
      [F, 'Foxconn Zhengzhou'],
      [A, 'Apple Park'],
    ]) {
      svg.append('text').attr('class', 'size-title').attr('x', S.x + S.w / 2).attr('y', 32).attr('text-anchor', 'middle').text(name);
    }

    // Dimension lines, as in the sketch: Foxconn length left / width below; Apple width above / length left.
    dimLine(svg, { x1: F.x - DIM_OFFSET, y1: F.y, x2: F.x - DIM_OFFSET, y2: baseY, label: distance(fox.length_m), vertical: true });
    dimLine(svg, { x1: F.x, y1: baseY + DIM_OFFSET, x2: F.x + F.w, y2: baseY + DIM_OFFSET, label: distance(fox.width_m) }).attr(
      'y',
      baseY + DIM_OFFSET + 18
    );
    dimLine(svg, { x1: A.x, y1: A.y - DIM_OFFSET, x2: A.x + A.w, y2: A.y - DIM_OFFSET, label: distance(apple.width_m) });
    dimLine(svg, { x1: A.x - DIM_OFFSET, y1: A.y, x2: A.x - DIM_OFFSET, y2: baseY, label: distance(apple.length_m), vertical: true });

    // Area under each site: hectares first, acres in parentheses, km² smaller.
    const areaY = baseY + 92;
    for (const [S, s] of [
      [F, fox],
      [A, apple],
    ]) {
      const cx = S.x + S.w / 2;
      const t = svg.append('text').attr('class', 'size-area').attr('x', cx).attr('y', areaY).attr('text-anchor', 'middle');
      t.append('tspan').attr('class', 'size-area__ha').text(`${ha.format(s.area_ha)} hectares`);
      svg
        .append('text')
        .attr('class', 'size-area__sub')
        .attr('x', cx)
        .attr('y', areaY + 24)
        .attr('text-anchor', 'middle')
        .text(`(${acres.format(s.area_acres)} acres) · ${km2.format(s.area_km2)} km²`);
      if (s.drawn_shape_is_illustrative) {
        svg
          .append('text')
          .attr('class', 'size-area__note')
          .attr('x', cx)
          .attr('y', areaY + 44)
          .attr('text-anchor', 'middle')
          .text('Published figure; outline illustrative');
      }
    }

    // Shared scale bar.
    const barW = SCALE_BAR_M * k;
    const bar = svg.append('g').attr('class', 'size-dim').attr('transform', `translate(${MARGIN_LEFT}, ${H - 14})`);
    bar.append('line').attr('x1', 0).attr('x2', barW).attr('y1', 0).attr('y2', 0);
    bar.append('line').attr('x1', 0).attr('x2', 0).attr('y1', -TICK).attr('y2', 0);
    bar.append('line').attr('x1', barW).attr('x2', barW).attr('y1', -TICK).attr('y2', 0);
    bar.append('text').attr('class', 'size-dim__label').attr('x', barW + 10).attr('y', 0).attr('dy', '0.32em').text(`${SCALE_BAR_M / 1000} km, same scale for both`);

    const credit = document.createElement('p');
    credit.className = 'size-figure__credit';
    credit.textContent = 'Imagery © Google, via Google Earth.';
    figure.append(credit);

    addMethodNote(el, 'How these sizes were measured', [
      `Foxconn Zhengzhou: ${fox.source}. ${fox.method}`,
      `Apple Park: ${apple.source}. ${apple.method}`,
      `Width and length: ${fox.width_length_source} Apple Park: ${apple.width_length_source}`,
      `Each cut-out is drawn at the scale that matches its outline to its own KML extents. Read from each screenshot's scale bar instead, Foxconn would be ${fox.scale_bar_vs_kml_pct}% and Apple Park ${apple.scale_bar_vs_kml_pct}% larger (the Foxconn screenshot has a slight camera tilt).`,
    ]);

    addCaveat(
      el,
      "Foxconn Zhengzhou's outline is hand-traced, not an official boundary. Apple Park's outline is illustrative only: its size is Apple's published figure, not measured from this image. Widths and lengths are rough east-west and north-south extents."
    );

    container.replaceChildren(el);
  },
};
