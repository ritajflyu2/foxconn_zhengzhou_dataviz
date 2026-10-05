import { select, scaleLinear, scaleBand, line, area, curveStepAfter, format, max } from 'd3';
import { addCaveat, addMethodNote } from '../../lib/sceneShell.js';
import { createTooltip } from '../../lib/tooltip.js';
import { cssVar } from '../../lib/colorTokens.js';
import { two, reducedMotion, createScene, playerControls, counter } from '../shared.js';
import data from '../../../data/environment/expansion.json';

const mapImages = import.meta.glob('../../../assets/environment/*.webp', { eager: true, query: '?url', import: 'default' });

// Expansion: year by year, the campus zones light up as their assembly-project
// EIAs are approved, and the approved NMHC / COD capacity they add builds up.
// One slider drives everything (copied from Labor Scene 3's player): it
// autoplays once the scene is in view and can be scrubbed by hand.



// One step chart per measure (cumulative, t/year), sharing the year axis: two
// measures on two charts, never one chart with two y-scales. Axis, gridlines,
// year labels and reveal follow Labor Scene 3's charts; each revealed year
// carries its exact cumulative value.
const CH_W = 460; // Labor Scene 3's chart width
const CH_H = 140; // short enough that map + charts fit one window
const CH_M = { top: 30, right: 8, bottom: 26, left: 44 };

function footprintChart(parent, { key, label, color, years }) {
  const x = scaleBand().domain(years.map((d) => d.year)).range([CH_M.left, CH_W - CH_M.right]).paddingInner(0);
  const xAt = (yr) => x(yr) + x.bandwidth() / 2;
  const y = scaleLinear().domain([0, max(years, (d) => d[key])]).nice().range([CH_H - CH_M.bottom, CH_M.top]);
  const figure = document.createElement('figure');
  figure.className = 'figure chart-col__figure env-chart-figure';
  parent.append(figure);
  const svg = select(figure).append('svg').attr('viewBox', `0 0 ${CH_W} ${CH_H}`).attr('class', 'env-chart').attr('role', 'img').attr('aria-label', `Cumulative approved ${label} by year, ${data.unit}`);
  svg.append('text').attr('class', 'env-chart__name').attr('x', CH_M.left).attr('y', 10).text(`${label} · ${data.unit}`);
  const axisG = svg.append('g').attr('class', 'chart-axis');
  for (const t of y.ticks(4)) {
    axisG.append('line').attr('class', 'chart-gridline').attr('x1', CH_M.left).attr('x2', CH_W - CH_M.right).attr('y1', y(t)).attr('y2', y(t));
    axisG.append('text').attr('class', 'chart-axis__label').attr('x', CH_M.left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(format(',')(t));
  }
  svg
    .selectAll('text.year-label')
    .data(years)
    .join('text')
    .attr('class', 'year-label')
    .attr('x', (d) => xAt(d.year))
    .attr('y', CH_H - 8)
    .attr('text-anchor', 'middle')
    .text((d) => d.year);
  // Step line over every year (faint), and the part up to the current year (solid).
  const pts = years.map((d) => [x(d.year), y(d[key])]).concat([[CH_W - CH_M.right, y(years[years.length - 1][key])]]);
  const stepLine = line().curve(curveStepAfter);
  const stepArea = area().curve(curveStepAfter).y0(y(0));
  svg.append('path').attr('class', 'env-chart__future').attr('d', stepLine(pts)).attr('stroke', color);
  const clipId = `env-clip-${key}`;
  const clip = svg.append('clipPath').attr('id', clipId).append('rect').attr('x', 0).attr('y', 0).attr('height', CH_H).attr('width', 0);
  const done = svg.append('g').attr('clip-path', `url(#${clipId})`);
  done.append('path').attr('class', 'env-chart__area').attr('d', stepArea(pts)).attr('fill', color);
  done.append('path').attr('class', 'env-chart__line').attr('d', stepLine(pts)).attr('stroke', color);
  // Each year's exact cumulative value, over its step, shown once revealed.
  const values = svg
    .selectAll('text.env-chart__value')
    .data(years)
    .join('text')
    .attr('class', 'env-chart__value')
    .attr('x', (d) => xAt(d.year))
    .attr('y', (d) => y(d[key]) - 6)
    .attr('text-anchor', 'middle')
    .text((d) => two(d[key]));
  const dot = svg.append('circle').attr('class', 'env-chart__dot').attr('r', 4).attr('fill', color);
  return (index) => {
    const on = index >= 0;
    // Stop just short of the next year's step, so its rise is not drawn yet.
    const right = on ? x(years[index].year) + x.bandwidth() - 2 : CH_M.left;
    clip.attr('width', index >= years.length - 1 ? CH_W : right);
    values.classed('revealed', (_d, i) => i <= index);
    dot.attr('opacity', on ? 1 : 0);
    if (on) dot.attr('cx', xAt(years[index].year)).attr('cy', y(years[index][key]));
  };
}

export default {
  id: 1,
  navLabel: 'Expansion',

  mount(container) {
    const years = data.years;
    const first = years[0];
    const last = years[years.length - 1];
    const lit = data.zones.filter((z) => z.year_approved != null);
    const { el, head, body } = createScene(1);
    head.querySelector('h2').textContent = 'Production and approved environmental capacity grow together.';
    head.querySelector('.scene__summary').textContent = `Each assembly project on the campus needed an environmental approval, and each approval set how much NMHC (a measure of volatile air pollutants) and COD (a measure of water pollution) it was designed to emit. From ${first.year} to ${last.year}, ${lit.length} of the map's ${data.zones.length} zones were approved this way.`;

    const nmhcColor = cssVar('--color-env-nmhc');
    const codColor = cssVar('--color-env-cod');

    // 1. The two running totals.
    const counters = document.createElement('div');
    counters.className = 'prod-counters env-counters';
    body.append(counters);
    const setNmhc = counter(counters, 'Cumulative NMHC approved', nmhcColor, data.unit);
    const setCod = counter(counters, 'Cumulative COD approved', codColor, data.unit);

    // 2. The zone map beside the footprint charts.
    const layout = document.createElement('div');
    layout.className = 'env-layout';
    body.append(layout);

    const mapFig = document.createElement('figure');
    mapFig.className = 'figure env-map';
    layout.append(mapFig);
    const tooltip = createTooltip(mapFig);
    const [iw, ih] = data.image_px;
    const svg = select(mapFig)
      .append('svg')
      .attr('viewBox', `0 0 ${iw} ${ih}`)
      .attr('role', 'img')
      .attr('aria-label', `Campus map; zones light up in the year their assembly project was approved, ${first.year}–${last.year}`);
    svg.append('image').attr('href', mapImages[`../../../assets/environment/${data.image}`]).attr('width', iw).attr('height', ih);
    const zonePaths = svg
      .append('g')
      .selectAll('path')
      .data(data.zones)
      .join('path')
      .attr('class', 'env-zone')
      .attr('d', (z) => z.path)
      .attr('tabindex', 0)
      .attr('aria-label', (z) => `Zone ${z.label}: ${z.year_approved ? `approved ${z.year_approved}${z.approximate ? ' (approximate placement)' : ''}` : 'no assembly-project approval in the record'}`);

    // Map legend (Scene 3's pill style), under the map.
    const legendItem = (ul, swClass, text, color) => {
      const li = document.createElement('li');
      li.className = 'legend__item';
      const sw = document.createElement('span');
      sw.className = `legend__swatch ${swClass}`;
      if (color) sw.style.borderColor = color;
      const l = document.createElement('span');
      l.textContent = text;
      li.append(sw, l);
      ul.append(li);
    };
    const legend = document.createElement('ul');
    legend.className = 'legend env-legend';
    legendItem(legend, 'env-legend__swatch env-legend__swatch--on', 'Approved');
    legendItem(legend, 'env-legend__swatch env-legend__swatch--off', 'Not yet approved or no record');
    mapFig.append(legend);

    // The footprint charts: Scene 3's column shape (head, legend, charts).
    const chartCol = document.createElement('div');
    chartCol.className = 'chart-col env-charts';
    layout.append(chartCol);
    const chartHead = document.createElement('p');
    chartHead.className = 'chart-col__head';
    chartHead.textContent = 'The footprint: approved capacity, cumulative';
    chartCol.append(chartHead);
    const chartLegend = document.createElement('ul');
    chartLegend.className = 'legend';
    legendItem(chartLegend, 'legend__swatch--line', `NMHC (${data.unit})`, nmhcColor);
    legendItem(chartLegend, 'legend__swatch--line', `COD (${data.unit})`, codColor);
    chartCol.append(chartLegend);
    const setNmhcChart = footprintChart(chartCol, { key: 'cum_nmhc', label: 'NMHC', color: nmhcColor, years });
    const setCodChart = footprintChart(chartCol, { key: 'cum_cod', label: 'COD', color: codColor, years });

    // The map runs from the top of the charts' heading to the bottom of the
    // last chart, its width following from the image's shape.
    const charts = chartCol.querySelectorAll('.env-chart');
    const fitMap = () => {
      const top = chartHead.getBoundingClientRect().top;
      const bottom = charts[charts.length - 1].getBoundingClientRect().bottom;
      svg.style('height', `${Math.max(0, bottom - top)}px`);
    };
    const ro = new ResizeObserver(() => (mapFig.isConnected ? fitMap() : ro.disconnect()));
    ro.observe(chartCol);

    // 3. The year slider.
    const player = playerControls(body, {
      years,
      secondsPerYear: data.animation.seconds_per_year,
      onReveal(revealCount) {
        const index = revealCount - 1;
        const yr = index >= 0 ? years[index] : null;
        zonePaths
          .classed('is-on', (z) => yr != null && z.year_approved != null && z.year_approved <= yr.year)
          .classed('is-new', (z) => yr != null && z.year_approved === yr.year && !reducedMotion());
        // Restart the pulse on this year's zones.
        zonePaths.filter('.is-new').each(function () {
          this.classList.remove('is-new');
          void this.getBBox();
          this.classList.add('is-new');
        });
        setNmhc(yr ? yr.cum_nmhc : 0);
        setCod(yr ? yr.cum_cod : 0);
        setNmhcChart(index);
        setCodChart(index);
      },
    });

    // Hover / focus a zone: its approval and what it added.
    const card = (z) => {
      const wrap = document.createElement('div');
      const t = document.createElement('p');
      t.className = 'tooltip__title';
      t.textContent = `Zone ${z.label}`;
      const p = document.createElement('p');
      p.className = 'tooltip__note';
      const yr = years.find((d) => d.year === z.year_approved);
      p.textContent = z.year_approved
        ? `Approved ${z.year_approved}. That year added ${two(yr.add_nmhc)} t of NMHC and ${two(yr.add_cod)} t of COD a year${yr.zones.length > 1 ? ` (shared with ${data.zones.filter((d) => yr.zones.includes(d.id) && d.id !== z.id).map((d) => d.label).join(', ')})` : ''}.${z.approximate ? ` ${data.g_note}` : ''}`
        : 'No assembly-project environmental approval for this zone in the record.';
      wrap.append(t, p);
      return wrap;
    };
    const show = (event, z) => {
      const r = event.currentTarget.getBoundingClientRect();
      const f = mapFig.getBoundingClientRect();
      tooltip.show(card(z), { x: r.left + r.width / 2 - f.left, y: r.top - f.top + 12 });
    };
    zonePaths.on('pointerenter focus', show).on('pointerleave blur', () => tooltip.hide());

    addMethodNote(el, 'Sources and how to read it', [
      `Source: ${data.source}. Each year shows the running total of approved capacity; ${years.filter((d) => !d.new_approval).map((d) => d.year).join(' and ')} had no new approval, so the totals carry over unchanged.`,
      data.g_note,
      'The zones are traced from an illustrative campus plan, cropped to the site. Zones are lit only where an assembly-project approval names them.',
    ]);
    addCaveat(el, data.caveat);
    container.replaceChildren(el);

    // Autoplay once the scene is in view (reduced motion: the end state, no autoplay).
    if (!reducedMotion()) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            if (mapFig.isConnected) player.play();
          }
        },
        { threshold: 0.25 }
      );
      io.observe(layout);
    }
  },
};
