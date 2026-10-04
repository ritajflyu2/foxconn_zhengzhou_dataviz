import { select } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../introShell.js';
import foxconnUrl from '../../../../design/reference/google_earth/cropped/foxconn_cutout.png';
import appleUrl from '../../../../design/reference/google_earth/cropped/apple_cutout.png';
import harvardUrl from '../../../../design/reference/google_earth/cropped/harvard_sec_cutout.png';
import campusSizes from '../../../data/comparison/campus_sizes.json';

const IMAGES = { 'foxconn_cutout.png': foxconnUrl, 'apple_cutout.png': appleUrl, 'harvard_sec_cutout.png': harvardUrl };

// Layout, in screen px. All sites share one px-per-meter scale (k), fitted
// to the width and the window height (see fit()).
const MARGIN_LEFT = 70; // Foxconn's length line + label
const FOX_GAP = 40; // between Foxconn and the first comparison column
const COL_W = 215; // each comparison site's column, wide enough for its area and ratio text
const TOP = 70; // titles above the shapes
const DIM_OFFSET = 22; // dimension line distance from the outline
const TICK = 6;
const SCALE_BAR_M = 1000;

const ha = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const acres = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const km2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const ratio = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const distance = (m) => (m >= 1000 ? `≈ ${(m / 1000).toFixed(2)} km` : `≈ ${Math.round(m)} m`);
const times = (r) => (r >= 20 ? Math.round(r).toLocaleString('en-US') : ratio.format(r));

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
  // Vertical: label to the left, reading bottom-to-top — or, when the line is
  // too short to hold it, level and to the left. Horizontal: above the line.
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (vertical && len >= label.length * 8) text.attr('transform', `translate(${mx - 12}, ${my}) rotate(-90)`);
  else if (vertical) text.attr('text-anchor', 'end').attr('x', x1 - 8).attr('y', my).attr('dy', '0.32em');
  else text.attr('x', mx).attr('y', y1 - 10);
  return text;
}

export default {
  id: 1,
  navLabel: 'Size',

  mount(container) {
    const fox = { ...campusSizes.foxconn_zhengzhou_airport_zone, ...campusSizes.layout.foxconn_zhengzhou_airport_zone };
    const apple = { ...campusSizes.apple_park, ...campusSizes.layout.apple_park, ratio: campusSizes.ratio_foxconn_to_apple };
    const harvard = { ...campusSizes.harvard_sec, ...campusSizes.layout.harvard_sec, ratio: campusSizes.ratio_foxconn_to_harvard_sec };

    const { el, body } = createScene({
      index: 1,
      title: 'How big is Foxconn Zhengzhou?',
      summary: `Drawn to the same scale: the airport-zone campus (Hongfujin, FII Yuzhan and Henan Fuchi) is about ${times(apple.ratio)}× the size of Apple Park and about ${times(
        harvard.ratio
      )}× Harvard's Science and Engineering Complex.`,
    });



    // One meters-to-pixels scale for all sites, left to right on one baseline.
    // Drawn in screen px (viewBox = rendered size), so text keeps its size;
    // the scale k is the largest that fits both the width and the window height.
    const sites = [
      { s: fox, name: 'Foxconn Zhengzhou', sub: ['Airport-zone campus'] },
      { s: apple, name: 'Apple Park' },
      { s: harvard, name: 'Harvard SEC', sub: ['Science and Engineering Complex,', 'with its outdoor space'] },
    ];
    const BELOW = 148; // under the shapes: dimension line, areas, ratios (scale bar and credit share the ratio rows)

    const figure = document.createElement('figure');
    figure.className = 'figure size-figure';
    body.append(figure);
    const svg = select(figure).append('svg').attr('role', 'img');

    function draw(W, availH) {
      svg.selectAll('*').remove();
      const kW = (W - MARGIN_LEFT - FOX_GAP - COL_W * (sites.length - 1)) / fox.width_m;
      const maxHm = Math.max(...sites.map((d) => d.s.outline_bbox_px[3] * d.s.m_per_px));
      const kH = (availH - TOP - BELOW) / maxHm;
      const k = Math.max(0.01, Math.min(kW, kH));
      for (const d of sites) {
        d.w = d.s.outline_bbox_px[2] * d.s.m_per_px * k;
        d.h = d.s.outline_bbox_px[3] * d.s.m_per_px * k;
      }
      // Comparison sites placed so the white space between the three blocks
      // (each block as wide as its widest label) is the same; Harvard ends at
      // the right edge.
      const blockHalf = sites.map((d) => {
        const probe = svg.append('g');
        const widths = [probe.append('text').attr('class', 'size-title').text(d.name).node().getComputedTextLength()];
        for (const line of d.sub ?? []) widths.push(probe.append('text').attr('class', 'size-area__note').text(line).node().getComputedTextLength());
        widths.push(probe.append('text').attr('class', 'size-area__sub').text(`(${acres.format(d.s.area_acres)} acres) · ${km2.format(d.s.area_km2)} km²`).node().getComputedTextLength());
        probe.remove();
        return Math.max(d.w, ...widths) / 2;
      });
      const foxRight = Math.max(MARGIN_LEFT + sites[0].w, MARGIN_LEFT + sites[0].w / 2 + blockHalf[0]);
      const c2 = W - blockHalf[2] - 4;
      const gap = (c2 - blockHalf[2] - foxRight - 2 * blockHalf[1]) / 2;
      const centers = [null, foxRight + gap + blockHalf[1], c2];
      const baseY = TOP + Math.max(...sites.map((d) => d.h));
      sites.forEach((d, i) => {
        d.x = i === 0 ? MARGIN_LEFT : centers[i] - d.w / 2;
        d.y = baseY - d.h;
      });
      const H = baseY + BELOW;
      svg
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('width', W)
        .attr('height', H)
        .attr(
          'aria-label',
          sites.map((d) => `${d.name}, about ${distance(d.s.width_m)} by ${distance(d.s.length_m)}`).join('; ') + ', all drawn to the same scale.'
        );

      for (const d of sites) {
        const scale = d.s.m_per_px * k;
        svg
          .append('image')
          .attr('href', IMAGES[d.s.image])
          .attr('x', d.x - d.s.outline_bbox_px[0] * scale)
          .attr('y', d.y - d.s.outline_bbox_px[1] * scale)
          .attr('width', d.s.image_px[0] * scale)
          .attr('height', d.s.image_px[1] * scale);
        svg.append('text').attr('class', 'size-title').attr('x', d.x + d.w / 2).attr('y', 32).attr('text-anchor', 'middle').text(d.name);
        if (d.sub) {
          const sub = svg.append('text').attr('class', 'size-area__note').attr('text-anchor', 'middle');
          d.sub.forEach((line, i) => sub.append('tspan').attr('x', d.x + d.w / 2).attr('y', 52 + i * 15).text(line));
        }
      }

      // Dimension lines, as in the sketch: Foxconn length left / width below; the others width above / length left.
      const [F, ...others] = sites;
      dimLine(svg, { x1: F.x - DIM_OFFSET, y1: F.y, x2: F.x - DIM_OFFSET, y2: baseY, label: distance(fox.length_m), vertical: true });
      dimLine(svg, { x1: F.x, y1: baseY + DIM_OFFSET, x2: F.x + F.w, y2: baseY + DIM_OFFSET, label: distance(fox.width_m) }).attr(
        'y',
        baseY + DIM_OFFSET + 18
      );
      for (const d of others) {
        dimLine(svg, { x1: d.x, y1: d.y - DIM_OFFSET, x2: d.x + d.w, y2: d.y - DIM_OFFSET, label: distance(d.s.width_m) });
        dimLine(svg, { x1: d.x - DIM_OFFSET, y1: d.y, x2: d.x - DIM_OFFSET, y2: baseY, label: distance(d.s.length_m), vertical: true });
      }

      // Area under each site: hectares first, acres in parentheses, km² smaller;
      // under each comparison site, how many times bigger Foxconn Zhengzhou is.
      const areaY = baseY + 70;
      for (const d of sites) {
        const cx = d.x + d.w / 2;
        const s = d.s;
        const t = svg.append('text').attr('class', 'size-area').attr('x', cx).attr('y', areaY).attr('text-anchor', 'middle');
        t.append('tspan').attr('class', 'size-area__ha').text(`${ha.format(s.area_ha)} hectares`);
        svg
          .append('text')
          .attr('class', 'size-area__sub')
          .attr('x', cx)
          .attr('y', areaY + 21)
          .attr('text-anchor', 'middle')
          .text(`(${acres.format(s.area_acres)} acres) · ${km2.format(s.area_km2)} km²`);
        if (s.ratio != null) {
          const r = svg.append('text').attr('class', 'size-ratio').attr('text-anchor', 'middle');
          r.append('tspan').attr('x', cx).attr('y', areaY + 46).text('Foxconn Zhengzhou is');
          r.append('tspan').attr('class', 'size-ratio__value').attr('x', cx).attr('y', areaY + 67).text(`${times(s.ratio)}× this size`);
        }
  
      }

      // Shared scale bar.
      const barW = SCALE_BAR_M * k;
      const bar = svg.append('g').attr('class', 'size-dim').attr('transform', `translate(${MARGIN_LEFT}, ${areaY + 58})`); // under Foxconn's area, level with the ratios
      bar.append('line').attr('x1', 0).attr('x2', barW).attr('y1', 0).attr('y2', 0);
      bar.append('line').attr('x1', 0).attr('x2', 0).attr('y1', -TICK).attr('y2', 0);
      bar.append('line').attr('x1', barW).attr('x2', barW).attr('y1', -TICK).attr('y2', 0);
      bar.append('text').attr('class', 'size-dim__label').attr('x', barW + 10).attr('y', 0).attr('dy', '0.32em').text(`${SCALE_BAR_M / 1000} km, same scale for all three`);
    }

    // The whole screen fits one window: the drawing gets the height left once
    // everything else on the screen (heading, credit, notes, the space that
    // clears the arrow bar) is in place.
    const fit = () => {
      if (!figure.isConnected) return window.removeEventListener('resize', fit);
      const W = figure.getBoundingClientRect().width;
      draw(W, 10);
      // Measured from the screen's own last element, not the page height (that
      // never reads less than the window).
      const r = svg.node().getBoundingClientRect();
      const top = r.top + window.scrollY;
      const section = figure.closest('.scene');
      const rootPad = parseFloat(getComputedStyle(section.parentElement).paddingBottom) || 0;
      const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      const below = section.getBoundingClientRect().bottom - r.bottom + rootPad + bodyPad;
      draw(W, Math.max(300, window.innerHeight - top - below - 2));
    };
    window.addEventListener('resize', fit);
    requestAnimationFrame(fit);
    document.fonts?.ready.then(fit); // text reflows once the web fonts arrive



    addMethodNote(el, 'How these sizes were measured', [
      `Foxconn Zhengzhou: ${fox.source}. ${fox.method}`,
      `Apple Park: ${apple.source}. ${apple.method}`,
      `Harvard SEC: ${harvard.source}. ${harvard.method}`,
      `Width and length: ${fox.width_length_source} Apple Park: ${apple.width_length_source} Harvard SEC: ${harvard.width_length_source}`,
      `Each cut-out is drawn at the scale that matches its outline to its own KML extents. Read from each screenshot's scale bar instead, Foxconn would be ${fox.scale_bar_vs_kml_pct}%, Apple Park ${apple.scale_bar_vs_kml_pct}% and the Harvard SEC ${harvard.scale_bar_vs_kml_pct}% larger (the Foxconn screenshot has a slight camera tilt).`,
    ]);
    // Imagery credit: at the right, on the same line as the notes link.
    const credit = document.createElement('p');
    credit.className = 'size-credit';
    credit.textContent = 'Imagery © Google Earth';
    el.append(credit);

    addCaveat(
      el,
      "Foxconn Zhengzhou's and the Harvard SEC's outlines are hand-traced, not official boundaries. Apple Park's outline is illustrative only: its size is Apple's published figure, not measured from this image. Widths and lengths are rough east-west and north-south extents."
    );

    container.replaceChildren(el);
  },
};
