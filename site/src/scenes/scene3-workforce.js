import { select, scaleBand, scaleLinear, max } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../lib/sceneShell.js';
import { createTooltip } from '../lib/tooltip.js';
import { colorFor, cssVar } from '../lib/colorTokens.js';
import { count } from '../lib/format.js';

const W = 460;
const H = 280;
const MARGIN = { top: 18, right: 8, bottom: 26, left: 44 };

// --- dot-matrix bars ----------------------------------------------------
// The storyboard's visual direction makes the dot the recurring unit: Scene 2's
// workers are dots on the floor, so Scene 3's bars are stacked dots rather than
// solid fills — the same mass of marks, regrouped. Capacity is fixed per chart
// (every bar has the same number of grid cells); unfilled cells stay visible as
// faint dots, same as the empty cells in the dot-grid poster reference.
function computeGrid(bandwidth, plotHeight, dotR, gap) {
  const pitch = dotR * 2 + gap;
  const cols = Math.max(1, Math.floor((bandwidth + gap) / pitch));
  const rows = Math.max(1, Math.floor((plotHeight + gap) / pitch));
  return { cols, rows, pitch, dotR, capacity: cols * rows };
}

function dotCenters(grid, xLeft, yBottom, n) {
  const centers = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / grid.cols);
    const col = i % grid.cols;
    centers.push([xLeft + grid.pitch / 2 + col * grid.pitch, yBottom - grid.pitch / 2 - row * grid.pitch]);
  }
  return centers;
}

// segments: ordered bottom-up [{count, fill|ring, card}]. Each segment is its
// own group: hovering it fades the bar's other segments and shows a single
// value for just that segment (the "highlight the worker type and number"
// behavior) — the same per-layer pattern as Scene 1's rings. `padEmpty` draws
// the rest of the fixed grid capacity as faint, non-interactive dots.
function renderDotBar(svg, { x, yBase, grid, segments, revealKey, padEmpty, tooltip, scaleAt }) {
  const g = svg.append('g').attr('class', 'yeardots').attr('data-reveal', revealKey);
  const allCenters = dotCenters(grid, x, yBase, grid.capacity);
  let cursor = 0;
  const segGroups = [];

  for (const seg of segments) {
    const slice = allCenters.slice(cursor, cursor + seg.count);
    cursor += seg.count;
    if (seg.count === 0) continue;

    const segG = g.append('g').attr('class', 'bar-segment').attr('data-kind', seg.kind ?? null);
    const dots = segG
      .selectAll(null)
      .data(slice)
      .join('circle')
      .attr('class', 'bar-dot')
      .attr('cx', (d) => d[0])
      .attr('cy', (d) => d[1])
      .attr('r', grid.dotR);
    if (seg.ring) dots.attr('fill', 'none').attr('stroke', seg.ring).attr('stroke-width', 1.1);
    else dots.attr('fill', seg.fill);

    const anchorY = slice.reduce((s, d) => s + d[1], 0) / slice.length;
    segGroups.push({ segG, card: seg.card, anchorX: x + grid.pitch * grid.cols * 0.5, anchorY });
  }

  if (padEmpty) {
    const emptyColor = cssVar('--ink-muted');
    g.selectAll(null)
      .data(allCenters.slice(cursor))
      .join('circle')
      .attr('class', 'bar-dot bar-dot--empty')
      .attr('cx', (d) => d[0])
      .attr('cy', (d) => d[1])
      .attr('r', grid.dotR * 0.82)
      .attr('fill', emptyColor);
  }

  for (const entry of segGroups) {
    entry.segG
      .style('cursor', 'pointer')
      .on('pointerenter', () => {
        for (const other of segGroups) other.segG.style('opacity', other === entry ? 1 : 0.18);
        const { x: ax, y: ay } = scaleAt(entry.anchorX, entry.anchorY);
        tooltip.show(entry.card(), { x: ax, y: ay });
      })
      .on('pointerleave', () => {
        for (const other of segGroups) other.segG.style('opacity', 1);
        tooltip.hide();
      });
  }

  return g;
}

function singleValueCard(title, label, value, note) {
  const wrap = document.createElement('div');
  const t = document.createElement('p');
  t.className = 'tooltip__title';
  t.textContent = title;
  const sub = document.createElement('p');
  sub.className = 'tooltip__sub';
  sub.textContent = label;
  const val = document.createElement('p');
  val.className = 'tooltip__single-value';
  val.textContent = value;
  wrap.append(t, sub, val);
  if (note) {
    const n = document.createElement('p');
    n.className = 'tooltip__note';
    n.textContent = note;
    wrap.append(n);
  }
  return wrap;
}

function revealGroups(svg, selector, keyFn, years, revealCount) {
  svg.selectAll(selector).each(function () {
    const node = select(this);
    const key = keyFn(node);
    const i = years.findIndex((y) => String(y.year) === String(key));
    node.classed('revealed', i >= 0 && i < revealCount);
  });
}

function workforceTooltipCard(y) {
  const wrap = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'tooltip__title';
  title.textContent = String(y.year);
  wrap.append(title);

  const list = document.createElement('dl');
  const rows = [['Airport-zone insured', count(y.airport_insured)]];
  if (y.clw_total) {
    rows.push(['CLW total estimate', `${count(y.clw_total.low)}${y.clw_total.low !== y.clw_total.high ? `–${count(y.clw_total.high)}` : ''} (${y.clw_total.season_label})`]);
    if (y.clw_total.gap_shown) {
      rows.push([
        'Inferred gap (dispatch, students, other)',
        `${count(y.clw_total.gap_low)}${y.clw_total.gap_low !== y.clw_total.gap_high ? `–${count(y.clw_total.gap_high)}` : ''}`,
      ]);
    } else {
      rows.push(['Gap shown', 'No — off-season trough vs. a year-end insured count']);
    }
  } else {
    rows.push(['CLW total estimate', 'No estimate for this year']);
  }
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
  }
  wrap.append(list);

  const entityNote = document.createElement('p');
  entityNote.className = 'tooltip__note';
  const entities = Object.entries(y.insured_by_entity)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${count(v)}`)
    .join(' · ');
  entityNote.textContent = `By entity — ${entities}`;
  wrap.append(entityNote);

  if (y.year === 2020 && y.insured_by_entity.henan_fuchi === 1) {
    const flag = document.createElement('p');
    flag.className = 'tooltip__note';
    flag.textContent = 'Henan Fuchi shows 1 insured worker in 2020 — a reporting gap, not a real drop.';
    wrap.append(flag);
  }
  return wrap;
}

function postsTooltipCard(y, categories) {
  const wrap = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'tooltip__title';
  title.textContent = String(y.year);
  wrap.append(title);

  const list = document.createElement('dl');
  for (const cat of categories) {
    const dt = document.createElement('dt');
    dt.textContent = cat.label;
    const dd = document.createElement('dd');
    dd.textContent = count(y[cat.key]);
    list.append(dt, dd);
  }
  const dt = document.createElement('dt');
  dt.textContent = 'Total posts';
  const dd = document.createElement('dd');
  dd.textContent = count(y.total);
  list.append(dt, dd);
  wrap.append(list);
  return wrap;
}

function axisAndYearLabels(svg, yScale, x, years) {
  const axisG = svg.append('g').attr('class', 'chart-axis');
  for (const t of yScale.ticks(4)) {
    axisG
      .append('line')
      .attr('x1', MARGIN.left)
      .attr('x2', W - MARGIN.right)
      .attr('y1', yScale(t))
      .attr('y2', yScale(t))
      .attr('class', 'chart-gridline');
    axisG
      .append('text')
      .attr('x', MARGIN.left - 6)
      .attr('y', yScale(t))
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .attr('class', 'chart-axis__label')
      .text(count(t));
  }
  svg
    .selectAll('text.year-label')
    .data(years)
    .join('text')
    .attr('class', 'year-label')
    .attr('x', (y) => x(y.year) + x.bandwidth() / 2)
    .attr('y', H - 8)
    .attr('text-anchor', 'middle')
    .text((y) => y.year);
}

function buildWorkforceChart(container, workforce) {
  const years = workforce.years;
  const yMax = max(years, (y) => Math.max(y.airport_insured, y.clw_total ? y.clw_total.high : 0));

  const x = scaleBand()
    .domain(years.map((y) => y.year))
    .range([MARGIN.left, W - MARGIN.right])
    .paddingInner(0.3);
  const yScale = scaleLinear().domain([0, yMax]).range([H - MARGIN.bottom, MARGIN.top]).nice();
  const domainMax = yScale.domain()[1];
  const base = yScale(0);
  const plotHeight = base - MARGIN.top;

  const figure = document.createElement('figure');
  // `workforce-figure` is where the 2 → 3 transition stacks Scene 2's dots.
  figure.className = 'figure chart-col__figure workforce-figure';
  container.append(figure);

  const svg = select(figure)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', 'Airport-zone insured workers by year, with China Labor Watch total-workforce estimates where available');

  axisAndYearLabels(svg, yScale, x, years);

  const tooltip = createTooltip(figure);
  const scaleAt = (sx, sy) => {
    const r = figure.getBoundingClientRect();
    return { x: sx * (r.width / W), y: sy * (r.height / H) };
  };
  const blue = colorFor('regular');
  const orange = colorFor('dispatch');
  const grid = computeGrid(x.bandwidth(), plotHeight, 2.1, 1.3);
  const unit = domainMax / grid.capacity;

  const groups = svg
    .selectAll('g.yearbar')
    .data(years)
    .join('g')
    .attr('class', 'yearbar')
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', (y) => `${y.year}: ${count(y.airport_insured)} insured`);

  for (const y of years) {
    const insuredDots = Math.min(grid.capacity, Math.round(y.airport_insured / unit));
    const segments = [
      {
        count: insuredDots,
        fill: blue,
        card: () =>
          singleValueCard(
            String(y.year),
            'Insured (measured)',
            count(y.airport_insured),
            !y.clw_total
              ? 'No CLW total estimate for this year.'
              : !y.clw_total.gap_shown
              ? `CLW's ${y.clw_total.season_label} estimate here is ${count(y.clw_total.low)} — an off-season trough, not comparable to this year-end count, so no gap is drawn.`
              : null
          ),
      },
    ];
    if (y.clw_total && y.clw_total.gap_shown) {
      const totalDots = Math.min(grid.capacity, Math.round((y.airport_insured + y.clw_total.gap_high) / unit));
      segments.push({
        count: Math.max(0, totalDots - insuredDots),
        ring: orange,
        card: () =>
          singleValueCard(
            String(y.year),
            'Gap to CLW estimate (inferred)',
            `${count(y.clw_total.gap_low)}${y.clw_total.gap_low !== y.clw_total.gap_high ? `–${count(y.clw_total.gap_high)}` : ''}`,
            `Inferred dispatch, student and other uninsured workers — CLW's ${y.clw_total.season_label} total estimate here is ${count(y.clw_total.low)}${y.clw_total.low !== y.clw_total.high ? `–${count(y.clw_total.high)}` : ''}.`
          ),
      });
    }
    renderDotBar(svg, { x: x(y.year), yBase: base, grid, segments, revealKey: y.year, padEmpty: true, tooltip, scaleAt });
  }

  // Legal line (red, dashed, as in Scene 1): the 10% dispatch cap read off
  // every comparable CLW estimate (not the off-season ones) — regular workers
  // should be at least 90% of it. It is read off the same total the bar is
  // drawn to (CLW's high end on a range year, 2025), so line and bar agree;
  // the hover gives the range.
  const capPct = Math.round(workforce.legal_cap_share * 100);
  const capYears = years.filter((y) => y.clw_total?.gap_shown);
  const capAt = (y) => y.clw_total.legal_regular_floor_high;
  const range = (lo, hi) => (lo !== hi ? `${count(lo)}–${count(hi)}` : count(hi));
  const capLine = (sel, cls) =>
    sel
      .selectAll(`.${cls}`)
      .data(capYears)
      .join('line')
      .attr('class', cls)
      .attr('data-reveal', (y) => y.year)
      .attr('x1', (y) => x(y.year) - 5)
      .attr('x2', (y) => x(y.year) + x.bandwidth() + 5)
      .attr('y1', (y) => yScale(capAt(y)))
      .attr('y2', (y) => yScale(capAt(y)));
  capLine(svg, 'bar-cap-line');
  // A wider invisible twin takes the hover.
  capLine(svg, 'bar-cap-hit')
    .on('pointerenter', (event, y) => {
      const c = y.clw_total;
      const floor = range(c.legal_regular_floor_low, c.legal_regular_floor_high);
      const shortLo = c.legal_regular_floor_low - y.airport_insured;
      const shortHi = c.legal_regular_floor_high - y.airport_insured;
      tooltip.show(
        singleValueCard(
          String(y.year),
          `Legal line: ${100 - capPct}% of CLW's total`,
          floor,
          `Dispatch may be at most ${capPct}% of the workforce, so regular workers should reach ${floor} (${100 - capPct}% of CLW's ${c.season_label} estimate of ${range(c.low, c.high)}). ${
            shortHi > 0 ? `Insured workers fall ${range(Math.max(0, shortLo), shortHi)} short.` : 'Insured workers are above it.'
          }`
        ),
        scaleAt(x(y.year) + x.bandwidth() / 2, yScale(capAt(y)))
      );
    })
    .on('pointerleave', () => tooltip.hide());

  // Keyboard fallback: Tab onto a bar shows the combined summary, since there's
  // no pointer to hover individual segments with.
  groups.on('focus', (event, y) => {
    const bw = x.bandwidth();
    tooltip.show(workforceTooltipCard(y), scaleAt(x(y.year) + bw / 2, yScale(y.airport_insured)));
  });
  groups.on('blur', () => tooltip.hide());

  return {
    setReveal(revealCount) {
      revealGroups(svg, '.yeardots', (n) => n.attr('data-reveal'), years, revealCount);
      revealGroups(svg, '.bar-cap-line', (n) => n.attr('data-reveal'), years, revealCount);
      revealGroups(svg, '.bar-cap-hit', (n) => n.attr('data-reveal'), years, revealCount);
    },
  };
}

function buildPostsChart(container, posts) {
  const years = posts.years;
  const categories = posts.categories;

  const yMax = max(years, (y) => y.total);
  const x = scaleBand()
    .domain(years.map((y) => y.year))
    .range([MARGIN.left, W - MARGIN.right])
    .paddingInner(0.3);
  const yScale = scaleLinear().domain([0, yMax]).range([H - MARGIN.bottom, MARGIN.top]).nice();
  const domainMax = yScale.domain()[1];
  const base = yScale(0);
  const plotHeight = base - MARGIN.top;

  const figure = document.createElement('figure');
  // `posts-figure` + each segment's data-kind are where the 3 → 4 transition
  // picks up the worker-type colors.
  figure.className = 'figure chart-col__figure posts-figure';
  container.append(figure);

  const svg = select(figure)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', 'Recruitment posts by worker type and year');

  axisAndYearLabels(svg, yScale, x, years);

  const tooltip = createTooltip(figure);
  const scaleAt = (sx, sy) => {
    const r = figure.getBoundingClientRect();
    return { x: sx * (r.width / W), y: sy * (r.height / H) };
  };
  const grid = computeGrid(x.bandwidth(), plotHeight, 2.1, 1.3);
  const unit = domainMax / grid.capacity;

  const groups = svg
    .selectAll('g.yearbar')
    .data(years)
    .join('g')
    .attr('class', 'yearbar')
    .attr('tabindex', 0)
    .attr('role', 'img')
    .attr('aria-label', (y) => `${y.year}: ${count(y.total)} recruitment posts`);

  // Rounding per-category independently can drift from the bar's own total, so
  // round the running cumulative sum instead (largest-remainder-free, but exact
  // at the full-bar boundary, which is what matters for reading the stack).
  for (const y of years) {
    let prevDots = 0;
    let cumulative = 0;
    const segments = [];
    for (const cat of categories) {
      cumulative += y[cat.key] ?? 0;
      const dotsSoFar = Math.min(grid.capacity, Math.round(cumulative / unit));
      segments.push({
        count: Math.max(0, dotsSoFar - prevDots),
        fill: colorFor(cat.key),
        kind: cat.key,
        card: () => singleValueCard(String(y.year), cat.label, `${count(y[cat.key] ?? 0)} posts`),
      });
      prevDots = dotsSoFar;
    }
    // No filler dots here — the bar's height is just its own total, so a quiet
    // year reads as a short bar, not a mostly-empty one.
    renderDotBar(svg, { x: x(y.year), yBase: base, grid, segments, revealKey: y.year, padEmpty: false, tooltip, scaleAt });
  }

  // Keyboard fallback: Tab onto a bar shows the combined summary.
  groups.on('focus', (event, y) => {
    tooltip.show(postsTooltipCard(y, categories), scaleAt(x(y.year) + x.bandwidth() / 2, yScale(y.total)));
  });
  groups.on('blur', () => tooltip.hide());

  return {
    setReveal(revealCount) {
      revealGroups(svg, '.yeardots', (n) => n.attr('data-reveal'), years, revealCount);
    },
  };
}

function playerControls(container, { years, secondsPerYear, onReveal }) {
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const row = document.createElement('div');
  row.className = 'player-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'player-btn';

  const scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.min = '0';
  scrubber.max = String(years.length - 1);
  scrubber.className = 'player-scrubber';

  const yearReadout = document.createElement('span');
  yearReadout.className = 'player-year';

  row.append(button, scrubber, yearReadout);
  container.append(row);

  let revealCount = reducedMotion() ? years.length : 0;
  let playing = false;
  let timer = null;

  function sync() {
    scrubber.value = String(Math.max(0, revealCount - 1));
    yearReadout.textContent = revealCount > 0 ? String(years[Math.min(revealCount, years.length) - 1].year) : String(years[0].year);
    button.textContent = playing ? 'Pause' : revealCount >= years.length ? 'Replay' : 'Play';
    onReveal(revealCount, playing);
  }

  function stop() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function tick() {
    revealCount += 1;
    if (revealCount >= years.length) {
      revealCount = years.length;
      stop();
    }
    sync();
  }

  function play() {
    if (revealCount >= years.length) revealCount = 0;
    playing = true;
    sync();
    timer = setInterval(tick, secondsPerYear * 1000);
  }

  button.addEventListener('click', () => {
    if (playing) {
      stop();
      sync();
    } else {
      play();
    }
  });

  scrubber.addEventListener('input', () => {
    stop();
    revealCount = Number(scrubber.value) + 1;
    sync();
  });

  sync();
  if (!reducedMotion()) play();

  return { stop };
}

export default {
  id: 2,
  navLabel: 'Over time',
  colorKey: 'student',

  mount(container, { workforce, posts }) {
    const { el, body } = createScene({
      index: 2,
      title: 'Over time: who the plants hired',
      summary:
        'Insured workers by year next to China Labor Watch’s campus-wide estimate, beside recruitment posts by worker type. Each bar is a cluster of dots — the same unit as the assembly floor\'s workers — revealed year by year, 2016–2025.',
    });

    const layout = document.createElement('div');
    layout.className = 'scene3-layout';
    body.append(layout);

    const leftCol = document.createElement('div');
    leftCol.className = 'chart-col';
    const leftHead = document.createElement('p');
    leftHead.className = 'chart-col__head';
    leftHead.textContent = 'Workforce composition (airport zone)';
    leftCol.append(leftHead);

    const leftLegend = document.createElement('ul');
    leftLegend.className = 'legend';
    for (const item of [
      { kind: 'solid', color: colorFor('regular'), label: 'Insured (measured)' },
      { kind: 'ring', color: colorFor('dispatch'), label: 'Gap to CLW total (inferred)' },
      {
        kind: 'dash',
        color: colorFor('legal-cap'),
        label: `Legal line: ${Math.round(workforce.legal_cap_share * 100)}% of total workers`,
      },
    ]) {
      const li = document.createElement('li');
      li.className = 'legend__item';
      const sw = document.createElement('span');
      sw.className = `legend__swatch${item.kind === 'solid' ? '' : ` legend__swatch--${item.kind}`}`;
      if (item.kind === 'solid') sw.style.background = item.color;
      else sw.style.borderColor = item.color;
      const label = document.createElement('span');
      label.textContent = item.label;
      li.append(sw, label);
      leftLegend.append(li);
    }
    leftCol.append(leftLegend);

    const rightCol = document.createElement('div');
    rightCol.className = 'chart-col';
    const rightHead = document.createElement('p');
    rightHead.className = 'chart-col__head';
    rightHead.textContent = 'Recruitment posts by worker type';
    rightCol.append(rightHead);

    const rightLegend = document.createElement('ul');
    rightLegend.className = 'legend';
    for (const cat of posts.categories) {
      const li = document.createElement('li');
      li.className = 'legend__item';
      const sw = document.createElement('span');
      sw.className = 'legend__swatch';
      sw.style.background = colorFor(cat.key);
      const label = document.createElement('span');
      label.textContent = cat.label;
      li.append(sw, label);
      rightLegend.append(li);
    }
    rightCol.append(rightLegend);

    layout.append(leftCol, rightCol);

    const leftChart = buildWorkforceChart(leftCol, workforce);
    const rightChart = buildPostsChart(rightCol, posts);

    playerControls(body, {
      years: workforce.years,
      secondsPerYear: workforce.animation?.seconds_per_year ?? 0.8,
      onReveal(revealCount, playing) {
        leftChart.setReveal(revealCount);
        rightChart.setReveal(revealCount);
        // The 2 → 3 transition follows the autoplay through this event.
        el.dispatchEvent(new CustomEvent('yearreveal', { detail: { revealCount, playing, total: workforce.years.length } }));
      },
    });

    addMethodNote(el, 'Reading the left chart', [
      `Each dot stands for an equal share of the bar's value — not a fixed headcount like the assembly floor's dots, just the same visual unit reused so a bar reads as a cluster, not a block. Solid dots are insured headcount (measured); ring (outline-only) dots are the gap to China Labor Watch's campus-wide estimate (inferred dispatch, student and other uninsured workers). Faint dots are unfilled capacity, for scale. Hover either part of a bar for its own number. Off-season CLW years (no ring dots) get no gap, because the two figures are not comparable (a trough estimate vs. a year-end count); hover the bar for CLW's figure. The red dashed line on each year with a comparable CLW estimate is the legal line: dispatch may be at most ${Math.round(workforce.legal_cap_share * 100)}% of the workforce, so regular workers should reach ${100 - Math.round(workforce.legal_cap_share * 100)}% of CLW's total (for 2025, CLW's high end, the top of the bar).`,
      'Posts cannot size the workforce (right chart) — early years have as few as 7-9 posts total. The right chart\'s dots are not padded to a fixed capacity, so a bar\'s height is just its own total.',
      `How posts are grouped (right chart): ${posts.rule}`,
    ]);

    addCaveat(el, workforce.caveat, posts.caveat);
    container.replaceChildren(el);
  },
};
