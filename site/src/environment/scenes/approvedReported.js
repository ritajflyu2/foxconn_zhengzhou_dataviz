import { select, max, format, scalePoint, scaleLinear, line } from 'd3';
import { addCaveat, addMethodNote } from '../../lib/sceneShell.js';
import { cssVar } from '../../lib/colorTokens.js';
import { seededRandom } from '../../transitions/common.js';
import { two, reducedMotion, createScene, playerControls, counter } from '../shared.js';
import data from '../../../data/environment/approved_reported.json';
import city from '../../../data/environment/zhengzhou_city.json';

// Approved and reported: what Hongfujin reported each year (permit execution
// reports) against the design budget its approvals set. Three forms side by
// side, all redrawn each year: water (COD) and ammonia nitrogen as tanks of
// one approved year each, air (VOCs) as a particle cloud inside the approved
// budget's circle. Same player as Expansion (Labor Scene 3's, at its pace).

const pct = format('.0%');
const VB = 300; // each form's viewBox is VB tall; its width fits its own content
const REM_PER_UNIT = 17 / VB; // drawn size: VB units -> rem, the same scale for all three forms
const FORM_H = 258; // drawn height: the forms' content ends here (the air circle's foot), so no empty band under them
const TANK = { w: 54, h: 66, gapX: 20, gapY: 30 };
const STREAM_GAP_REM = 5; // between the three Hongfujin columns (and the city charts under them)
const CITY_H = 170; // city chart height, in the forms' VB units
const ARROW_BAR_PX = 80; // room kept clear above the fixed Back / Next buttons
const STEP_MS = 450; // level / radius changes, within one year's step

const ratioNote = (s, v) => {
  const r = v / s.approved;
  return r >= 1 ? `${r.toFixed(1)}× the approved ${two(s.approved)} t/year` : `${pct(r)} of the approved ${two(s.approved)} t/year`;
};

// Tanks: tank 1 is the approved year, set apart on the left behind a dashed
// line; whatever is reported beyond it fills the tanks on the right, under a
// "Beyond approval" bracket (after the environment preview's water form). A
// tank only appears once that year reaches it; its water has a moving surface.
const WAVE = Array.from({ length: 7 }, () => 'q10 -7 20 0 t20 0').join(' ');

// The ratio, as in the preview: a big number, a small label under it.
function ratioLine(svg, x, y) {
  const t = svg.append('text').attr('class', 'env-form__ratio').attr('x', x).attr('y', y).attr('text-anchor', 'middle');
  const subs = [0, 1].map((i) => svg.append('text').attr('class', 'env-form__tag').attr('x', x).attr('y', y + 19 + i * 15).attr('text-anchor', 'middle'));
  return (big, small) => {
    t.text(big);
    // Two short lines (as in the preview), so it fits under a tank.
    const words = small.split(' ');
    const cut = Math.ceil(words.length / 2);
    subs[0].text(words.slice(0, cut).join(' '));
    subs[1].text(words.slice(cut).join(' '));
  };
}

function tankForm(svg, s, color) {
  // (a sliver over a whole tank, e.g. 3.0004×, does not open another tank)
  const most = Math.max(1, Math.ceil(max(s.reported) / s.approved - 0.01));
  const beyond = most - 1;
  const cols = Math.min(3, Math.max(1, beyond)); // only as many columns as any year needs
  const x0 = 10;
  const sepX = x0 + TANK.w + 16;
  const bx = sepX + 16;
  const top = 58;
  const rows = Math.max(1, Math.ceil(beyond / cols));
  const pos = (k) =>
    k === 0 ? { x: x0, y: top } : { x: bx + ((k - 1) % cols) * (TANK.w + TANK.gapX), y: top + Math.floor((k - 1) / cols) * (TANK.h + TANK.gapY) };

  svg.append('text').attr('class', 'env-form__tag env-form__tag--strong').attr('x', x0 + TANK.w / 2).attr('y', top - 14).attr('text-anchor', 'middle').text('Approved');
  svg
    .append('line')
    .attr('class', 'env-tank__sep')
    .attr('x1', sepX)
    .attr('x2', sepX)
    .attr('y1', top - 24)
    .attr('y2', top + rows * (TANK.h + TANK.gapY) - TANK.gapY + 6);
  const bracket = svg.append('path').attr('class', 'env-tank__bracket');
  const beyondLabel = svg.append('text').attr('class', 'env-form__tag env-form__tag--muted').attr('y', top - 22).attr('text-anchor', 'middle').text('Beyond approval');
  const nothing = svg.append('g').attr('class', 'env-form__tag env-form__tag--faint');
  const width = bx + cols * (TANK.w + TANK.gapX) - TANK.gapX + 8;
  const midBeyond = bx + (cols * (TANK.w + TANK.gapX) - TANK.gapX) / 2;
  nothing.append('text').attr('x', midBeyond).attr('y', top + TANK.h / 2 - 4).attr('text-anchor', 'middle').text('Nothing beyond');
  nothing.append('text').attr('x', midBeyond).attr('y', top + TANK.h / 2 + 10).attr('text-anchor', 'middle').text('approval');

  const tanks = Array.from({ length: most }, (_, k) => {
    const { x, y } = pos(k);
    const g = svg.append('g').attr('class', 'env-tank-g');
    const clipId = `env-tank-${s.key}-${k}`;
    g.append('clipPath').attr('id', clipId).append('rect').attr('x', x).attr('y', y).attr('width', TANK.w).attr('height', TANK.h).attr('rx', 4);
    g.append('rect').attr('class', 'env-tank').attr('x', x).attr('y', y).attr('width', TANK.w).attr('height', TANK.h).attr('rx', 4).attr('stroke', color);
    // The water: a body plus a moving wavy surface, raised and lowered as one.
    const water = g.append('g').attr('clip-path', `url(#${clipId})`).append('g').attr('transform', `translate(0, ${y + TANK.h})`);
    water.append('rect').attr('x', x).attr('y', 4).attr('width', TANK.w).attr('height', TANK.h).attr('fill', color).attr('opacity', 0.72);
    water
      .append('path')
      .attr('class', 'env-wave')
      .attr('d', `M${x - 40} 4 ${WAVE} V${TANK.h + 4} H${x - 40} Z`)
      .attr('fill', color)
      .attr('opacity', 0.72)
      .style('animation-delay', `-${k * 0.4}s`);
    return { x, y, g, water };
  });
  // Under the approved tank, as in the preview.
  const setRatio = ratioLine(svg, x0 + TANK.w / 2, top + TANK.h + 44);

  return { width, update: (v) => {
    const r = v / s.approved;
    setRatio(r >= 1 ? `${r.toFixed(1)}×` : pct(r), 'the approved amount');
    let shown = 0;
    for (const [k, t] of tanks.entries()) {
      const f = Math.max(0, Math.min(1, r - k));
      // Beyond-approval tanks only exist once the year reaches them.
      const on = k === 0 || f > 0;
      if (k > 0 && on) shown += 1;
      t.g.classed('is-hidden', !on);
      const sel = reducedMotion() ? t.water : t.water.transition().duration(STEP_MS);
      sel.attr('transform', `translate(0, ${t.y + TANK.h * (1 - f)})`);
    }
    // The bracket spans the beyond tanks that are showing (first row).
    const across = Math.min(cols, shown);
    const w = across * (TANK.w + TANK.gapX) - TANK.gapX;
    bracket.attr('d', across ? `M${bx} ${top - 6}V${top - 12}H${bx + w}V${top - 6}` : '').classed('is-hidden', !across);
    beyondLabel.attr('x', bx + w / 2).classed('is-hidden', !across);
    nothing.classed('is-hidden', across > 0);
  } };
}

// Air: the dashed circle is the approved budget; the filled circle's area is
// the reported amount, scattered with one particle per tonne.
function cloudForm(svg, s, color) {
  const R = 100;
  const cx = R + 10;
  const cy = 152;
  const RATIO_W = 90; // the ratio sits to the circle's right, not under it
  const width = cx + R + 14 + RATIO_W;
  const most = Math.ceil(max(s.reported));
  const rnd = seededRandom(7);
  const unit = Array.from({ length: most }, () => {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    return [Math.cos(a) * d, Math.sin(a) * d];
  });
  svg.append('circle').attr('class', 'env-cloud__budget').attr('cx', cx).attr('cy', cy).attr('r', R).attr('stroke', color);
  svg.append('text').attr('class', 'env-form__tag').attr('x', cx).attr('y', cy - R - 10).attr('text-anchor', 'middle').text(`Approved ${two(s.approved)} t`);
  const fill = svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 0).attr('fill', color).attr('opacity', 0.14);
  const dots = svg
    .append('g')
    .selectAll('circle')
    .data(unit)
    .join('circle')
    .attr('r', (_d, i) => 1.5 + (i % 3) * 0.5)
    .attr('fill', color)
    .attr('cx', cx)
    .attr('cy', cy);
  const setRatio = ratioLine(svg, cx + R + 14 + RATIO_W / 2, cy - 4);
  return { width, update: (v) => {
    const r = v / s.approved;
    const rr = R * Math.sqrt(r);
    const n = Math.round(v);
    setRatio(r >= 1 ? `${r.toFixed(1)}×` : pct(r), r >= 1 ? 'the approved budget' : 'approved budget');
    const t = (sel) => (reducedMotion() ? sel : sel.transition().duration(STEP_MS));
    t(fill).attr('r', rr);
    t(dots)
      .attr('cx', ([ux]) => cx + ux * Math.max(0, rr - 3))
      .attr('cy', ([, uy]) => cy + uy * Math.max(0, rr - 3))
      .attr('opacity', (_d, i) => (i < n ? 1 : 0));
  } };
}

// Zhengzhou citywide context under the Hongfujin forms: a line chart per
// medium, up = worse like the forms (water: share of river sections NOT rated
// good; air: PM2.5 against China's standard). Both charts share one year axis (every city year),
// so a year sits at the same relative place in each. Years up to the player's
// current year are drawn solid with their values; later ones are faint.
const CITY_YEARS = [...new Set([...city.air.years, ...city.water.years].map((d) => d.year))].sort((a, b) => a - b);
const CM = { top: 24, right: 16, bottom: 28, left: 40 };
// The shared top of both city charts' y axes: the largest value either shows, rounded up.
const CITY_TOP = scaleLinear()
  .domain([0, Math.max(...city.water.years.map((d) => d.value), ...city.air.years.map((d) => d.value), city.air.baseline?.value ?? 0)])
  .nice()
  .domain()[1];
const MIN_LABEL_GAP = 40; // VB units between year labels; closer than this, every other year is labelled

function cityChart(parent, medium, series, color, width) {
  // Titled like the forms' columns ("Water: COD").
  const head = document.createElement('p');
  head.className = 'chart-col__head';
  // Lower-case the label's first letter, but not an acronym (PM2.5).
  const label = /^[A-Z][a-z]/.test(series.label) ? series.label[0].toLowerCase() + series.label.slice(1) : series.label;
  head.textContent = `${medium}: ${city.city} ${label} (${series.unit})`;
  parent.append(head);
  const fig = document.createElement('figure');
  fig.className = 'figure chart-col__figure env-city__figure';
  parent.append(fig);
  const W = width;
  const x = scalePoint().domain(CITY_YEARS).range([CM.left, W - CM.right]).padding(0.3);
  // One y range for both city charts, so their gridlines sit level side by side.
  const y = scaleLinear().domain([0, CITY_TOP]).range([CITY_H - CM.bottom, CM.top]);
  const svg = select(fig)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${CITY_H}`)
    .attr('class', 'env-chart env-city__chart')
    .style('max-width', `${(W * REM_PER_UNIT).toFixed(2)}rem`)
    .attr('role', 'img')
    .attr('aria-label', `${city.city}: ${series.label} (${series.unit}), ${series.years[0].year}–${series.years[series.years.length - 1].year}`);
  const axisG = svg.append('g').attr('class', 'chart-axis');
  for (const t of y.ticks(4)) {
    axisG.append('line').attr('class', 'chart-gridline').attr('x1', CM.left).attr('x2', W - CM.right).attr('y1', y(t)).attr('y2', y(t));
    axisG.append('text').attr('class', 'chart-axis__label').attr('x', CM.left - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(format(',')(t));
  }
  const every = x.step() < MIN_LABEL_GAP ? 2 : 1;
  svg
    .selectAll('text.year-label')
    .data(series.years.filter((_d, i) => i % every === 0 || i === series.years.length - 1))
    .join('text')
    .attr('class', 'year-label')
    .attr('x', (d) => x(d.year))
    .attr('y', CITY_H - 7)
    .attr('text-anchor', 'middle')
    .text((d) => d.year);
  // China's standard (air), as a dashed reference line labelled at its end.
  if (series.baseline) {
    const by = y(series.baseline.value);
    svg.append('line').attr('class', 'env-city__baseline').attr('x1', CM.left).attr('x2', W - CM.right).attr('y1', by).attr('y2', by);
    svg
      .append('text')
      .attr('class', 'env-city__baseline-label')
      .attr('x', W - CM.right)
      .attr('y', by + 12)
      .attr('text-anchor', 'end')
      .text(`${series.baseline.label}: ${series.baseline.value}`);
  }
  const marker = svg.append('line').attr('class', 'env-city__marker').attr('y1', CM.top - 6).attr('y2', CITY_H - CM.bottom);
  const path = line()
    .x((d) => x(d.year))
    .y((d) => y(d.value));
  svg.append('path').attr('class', 'env-chart__future').attr('d', path(series.years)).attr('stroke', color);
  const solid = svg.append('path').attr('class', 'env-chart__line').attr('stroke', color);
  const dots = svg
    .selectAll('circle.env-city__dot')
    .data(series.years)
    .join('circle')
    .attr('class', 'env-city__dot')
    .attr('cx', (d) => x(d.year))
    .attr('cy', (d) => y(d.value))
    .attr('r', 3.5)
    .attr('fill', color);
  const values = svg
    .selectAll('text.env-chart__value')
    .data(series.years)
    .join('text')
    .attr('class', 'env-chart__value')
    .attr('x', (d) => x(d.year))
    .attr('y', (d) => y(d.value) - 8)
    .attr('text-anchor', 'middle')
    .text((d) => format(',.1~f')(d.value));
  // A comparison city (Boston, for PM2.5): its years inside this chart's span,
  // grey, labelled with its name at its last point; revealed with the year.
  let compareUpdate = () => {};
  if (series.compare) {
    const pts = series.compare.years.filter((d) => CITY_YEARS.includes(d.year));
    const cPath = line()
      .x((d) => x(d.year))
      .y((d) => y(d.value));
    const cLine = svg.append('path').attr('class', 'env-city__compare-line');
    const cDots = svg
      .selectAll('circle.env-city__compare-dot')
      .data(pts)
      .join('circle')
      .attr('class', 'env-city__compare-dot')
      .attr('cx', (d) => x(d.year))
      .attr('cy', (d) => y(d.value))
      .attr('r', 3);
    const cValues = svg
      .selectAll('text.env-city__compare-value')
      .data(pts)
      .join('text')
      .attr('class', 'env-chart__value env-city__compare-value')
      .attr('x', (d) => x(d.year))
      .attr('y', (d) => y(d.value) - 7)
      .attr('text-anchor', 'middle')
      .text((d) => format(',.1~f')(d.value));
    const cName = svg
      .append('text')
      .attr('class', 'env-city__compare-name')
      .attr('x', x(pts[0].year) - 8)
      .attr('y', y(pts[0].value))
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .text(series.compare.city);
    compareUpdate = (yr) => {
      const done = pts.filter((d) => d.year <= yr);
      cLine.attr('d', done.length > 1 ? cPath(done) : null);
      cDots.attr('opacity', (d) => (d.year <= yr ? 1 : 0));
      cValues.classed('revealed', (d) => d.year <= yr);
      cName.attr('opacity', done.length ? 1 : 0);
    };
  }
  return (year) => {
    compareUpdate(year);
    const done = series.years.filter((d) => d.year <= year);
    solid.attr('d', done.length > 1 ? path(done) : null);
    dots.attr('opacity', (d) => (d.year <= year ? 1 : 0.25));
    values.classed('revealed', (d) => d.year <= year);
    marker.attr('x1', x(year) ?? CM.left).attr('x2', x(year) ?? CM.left);
  };
}

export default {
  id: 2,
  navLabel: 'Approved and reported',

  mount(container) {
    const years = data.years;
    const byKey = Object.fromEntries(data.streams.map((s) => [s.key, s]));
    const { el, head, body } = createScene(2);
    head.querySelector('h2').textContent = 'How do the plants affect the city that sustains them?';
    const last = years.length - 1;
    head.querySelector('.scene__summary').textContent = `The approvals in Expansion set a design budget for each stream. Here is what Hongfujin reported against it each year, ${years[0]}–${years[last]}. ${city.city}'s citywide data also shows PM2.5 decreasing since ${city.air.years[0].year}, but water quality getting worse since ${city.water.years[0].year}.`;

    const colors = { cod: cssVar('--color-env-cod'), voc: cssVar('--color-env-nmhc'), nh3: cssVar('--color-env-nh3') };

    // 1. The three reported values, each against its budget.
    const counters = document.createElement('div');
    counters.className = 'prod-counters env-counters';
    body.append(counters);
    const setters = Object.fromEntries(data.streams.map((s) => [s.key, counter(counters, `${s.medium} · ${s.label} reported`, colors[s.key], data.unit)]));

    // 2. Three forms side by side, no dividers.
    const row = document.createElement('div');
    row.className = 'env-streams';
    body.append(row);
    const forms = {};
    for (const s of data.streams) {
      const col = document.createElement('div');
      col.className = 'chart-col';
      const h = document.createElement('p');
      h.className = 'chart-col__head';
      h.textContent = `${s.medium}: ${s.label}`;
      // The year being shown, after the title ("Water: COD, 2023").
      h.append(Object.assign(document.createElement('span'), { className: 'env-form__year' }));
      const key = document.createElement('p');
      key.className = 'env-form__key';
      // The approved amount itself is in the counter above, so the key just says what the marks mean.
      key.textContent = s.key === 'voc' ? 'Dashed circle = the approved budget · 1 dot = 1 t reported' : '1 tank = approved amount';
      const fig = document.createElement('figure');
      fig.className = 'figure chart-col__figure';
      col.append(h, key, fig);
      row.append(col);
      const svg = select(fig)
        .append('svg')
        .attr('viewBox', `0 0 ${VB} ${VB}`)
        .attr('class', 'env-form')
        .attr('role', 'img')
        .attr('aria-label', `${s.label}: reported against the approved ${two(s.approved)} t/year, by year`);
      forms[s.key] = s.key === 'voc' ? cloudForm(svg, s, colors[s.key]) : tankForm(svg, s, colors[s.key]);
      svg.attr('viewBox', `0 0 ${forms[s.key].width} ${FORM_H}`);
    }

    // Each column is as wide as its form at the shared scale, so the gaps
    // between the three are just the grid gap.
    const columns = data.streams.map((s) => `minmax(0, ${(forms[s.key].width * REM_PER_UNIT).toFixed(2)}rem)`).join(' ');
    row.style.gridTemplateColumns = columns;
    row.style.gap = `${STREAM_GAP_REM}rem`;
    // The three counters sit on the same grid, each over its own column.
    counters.style.display = 'grid';
    counters.style.gridTemplateColumns = columns;
    counters.style.gap = `0 ${STREAM_GAP_REM}rem`;
    counters.style.justifyContent = 'start';

    // Zhengzhou citywide context, read straight down: water under the two
    // water columns, air under the air column, on the same grid.
    // Zhengzhou citywide context: two charts of equal size (the water chart's
    // span under COD + ammonia nitrogen), side by side.
    const cityRow = document.createElement('div');
    cityRow.className = 'env-city';
    body.append(cityRow);
    const gapUnits = STREAM_GAP_REM / REM_PER_UNIT;
    const waterKeys = data.streams.filter((s) => s.medium === 'Water').map((s) => s.key);
    const airKeys = data.streams.filter((s) => s.medium === 'Air').map((s) => s.key);
    const cityW = waterKeys.reduce((t, k) => t + forms[k].width, 0) + gapUnits * (waterKeys.length - 1);
    cityRow.style.gridTemplateColumns = `repeat(2, minmax(0, ${(cityW * REM_PER_UNIT).toFixed(2)}rem))`;
    cityRow.style.gap = `${STREAM_GAP_REM}rem`;
    const waterCol = document.createElement('div');
    const airCol = document.createElement('div');
    cityRow.append(waterCol, airCol);
    const cityUpdates = [
      cityChart(waterCol, 'Water', city.water, colors[waterKeys[0]], cityW),
      cityChart(airCol, 'Air', city.air, colors[airKeys[0]], cityW),
    ];

    // 3. The year player (Labor Scene 3's), from the first report year.
    const player = playerControls(body, {
      years: years.map((year) => ({ year })),
      secondsPerYear: data.animation.seconds_per_year,
      onReveal(revealCount) {
        const i = Math.max(0, revealCount - 1);
        for (const y of row.querySelectorAll('.env-form__year')) y.textContent = `, ${years[i]}`;
        for (const update of cityUpdates) update(years[i]);
        for (const s of data.streams) {
          const v = s.reported[i];
          setters[s.key](v, ratioNote(s, v));
          forms[s.key].update(v);
        }
      },
    });

    addMethodNote(el, 'Sources and how to read it', [
      `Source: ${data.source}`,
      'Water and ammonia nitrogen: each tank holds one year of the approved amount. Only tank 1, set apart on the left, is covered by the approvals; reported amounts beyond it fill the tanks on the right. Air: the dashed circle is the approved budget; the filled circle is the reported amount by area, one dot per tonne.',
      data.voc_note,
      `${city.city} citywide context: ${city.source} ${city.air.label}: ${city.air.baseline.label} is ${city.air.baseline.value} ${city.air.unit} (${city.air.baseline.source}).`,
      ...city.notes,
      `${city.air.compare.city} PM2.5: ${city.air.compare.source}; shown for the years inside ${city.city}'s span (${city.air.compare.years.filter((d) => CITY_YEARS.includes(d.year)).map((d) => d.year).join(', ')}).`,
    ]);
    addCaveat(el, data.caveat);
    container.replaceChildren(el);

    // Autoplay once the forms are in view (reduced motion: the end state, no autoplay).
    if (!reducedMotion()) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            if (!row.isConnected) return;
            player.play();
            // Bring the rest (city charts, player) into view, smoothly, above the Back / Next bar.
            const over = body.querySelector('.player-row').getBoundingClientRect().bottom + ARROW_BAR_PX - window.innerHeight;
            if (over > 0) window.scrollBy({ top: over, behavior: 'smooth' });
          }
        },
        { threshold: 0.25 }
      );
      io.observe(row);
    }
  },
};
