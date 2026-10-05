import { select, forceSimulation, forceCollide, forceX, forceY } from 'd3';
import { addCaveat, addMethodNote } from '../../lib/sceneShell.js';
import { createTooltip } from '../../lib/tooltip.js';
import { colorFor, cssVar } from '../../lib/colorTokens.js';
import { count, percent, money } from '../../lib/format.js';
import { computePay } from '../../lib/payModel.js';
import { LINE_DOT_R, seededRandom, lineFloorDots } from '../../lib/floorDots.js';
import { raw } from '../../lib/dataLoader.js';
import { lastFloorClick } from '../../lib/floorNav.js';
import { flowIntoBars, floorDotsOnScreen, circleDots } from '../compareFlow.js';
import floor3Url from '../../../assets/labor/floor_3f.webp';
import lineUrl from '../../../assets/labor/production_line.webp';

// The management floor (3F): white-collar hiring posts by job family, as
// circles on the floor. "Compare pay" brings the assembly floor (1F, Scene 2's
// dots) in below it; both floors' dots flow into two bar charts on one RMB
// scale (posted white-collar pay vs. the wage calculator's line-worker pay),
// followed by how few white-collar workers there are next to the workforce.

const mgmt = raw.scene_mgmt;
const pay = raw.scene4_pay_model;
const floorData = raw.scene2_floor;
const floor3 = raw.floor_index.floors.find((f) => f.id === '3F');

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const cnyToMoney = (cny) => ({ cny: Math.round(cny), usd: Math.round((cny / pay.fx_cny_per_usd) * 100) / 100 });
const yearsLabel = `${mgmt.post_years[0]}–${mgmt.post_years[1]}`;
const payYearsLabel = `${mgmt.pay_years[0]}–${mgmt.pay_years[1]}`;

// Circle slots on the 3F floor image (its px): largest top left, as in the sketch.
// Small circles are labelled to their right, so their slots leave room there.
const SLOTS = [
  [185, 118],
  [328, 92],
  [282, 192],
  [196, 230],
  [392, 146],
];
const BAR_SPAN = 0.54;
const HOURS_PER_ROW = 20;

// The working week as one cell per hour (rows of 20), so 40 and 60 hours read at a glance.
function hoursStrip(hours, legal, label) {
  const wrap = el('div', 'mgmt-hours');
  const grid = el('div', 'mgmt-hours__grid');
  grid.style.setProperty('--cols', String(HOURS_PER_ROW));
  for (let h = 0; h < hours; h++) {
    const cell = el('span', 'mgmt-hours__cell');
    cell.style.setProperty('--i', String(h)); // fills in hour by hour on "Compare pay"
    grid.append(cell);
  }
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `${hours} hours a week${hours > legal ? `, ${hours - legal} above the ${legal}-hour legal standard` : ''}`);
  wrap.append(grid, el('p', 'mgmt-hours__label', label));
  return wrap;
} // the largest bar's share of the track; the rest holds its value label

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function card(title, rows, note) {
  const wrap = el('div');
  wrap.append(el('p', 'tooltip__title', title));
  if (rows?.length) {
    const dl = el('dl');
    for (const [k, v] of rows) dl.append(el('dt', null, k), el('dd', null, v));
    wrap.append(dl);
  }
  if (note) wrap.append(el('p', 'tooltip__note', note));
  return wrap;
}

// The line-worker side, from the wage calculator's own model at its defaults.
function lineWorkerPay() {
  const state = {
    hoursPerWeek: pay.defaults.hours_per_week,
    daysEmployed: pay.defaults.days_employed,
    employedOn25th: pay.defaults.employed_on_25th,
  };
  const p = Object.fromEntries(['full_time', 'rebate_dispatch', 'hourly_dispatch'].map((k) => [k, computePay(k, pay.workers[k], state, pay)]));
  const avg = (f) => (f(p.rebate_dispatch) + f(p.hourly_dispatch)) / 2;
  return {
    state,
    full: { paid: p.full_time.monthlyTotal.cny, cond: 0, total: p.full_time.monthlyTotal.cny, deduction: p.full_time.deduction },
    dispatch: {
      paid: avg((d) => d.monthlyPaid.cny),
      cond: avg((d) => d.monthlyConditional?.cny ?? 0),
      total: avg((d) => d.monthlyTotal.cny),
      rebate: p.rebate_dispatch,
      hourly: p.hourly_dispatch,
    },
  };
}

export default {
  id: 1,
  navLabel: 'Management floor',

  mount(container) {
    const section = el('section', 'scene');
    section.id = 'mgmt-scene-1';
    const head = el('div');
    head.append(
      el('p', 'scene__index', 'Management'),
      el('h2', null, 'Upstairs: who gets hired, and for how much'),
      el(
        'p',
        'scene__summary',
        `The management floor, from ${count(mgmt.posts_total)} white-collar hiring posts (${yearsLabel}). Most are for engineers. Compare their posted pay with what a line worker makes on the floor below.`
      )
    );
    const body = el('div', 'scene__body');
    section.append(head, body);

    const shades = mgmt.categories.map((_c, i) => cssVar(`--color-mgmt-${i + 1}`));
    const colorOf = Object.fromEntries(mgmt.categories.map((c, i) => [c.key, shades[i]]));

    // --- Stage: floors on the left, charts on the right ------------------------
    const stage = el('div', 'mgmt-stage');
    body.append(stage);
    const floors = el('div', 'mgmt-floors');
    const side = el('div', 'mgmt-side');
    stage.append(floors, side);

    // 3F floor with its circles.
    const floorFig = el('figure', 'figure mgmt-floor');
    floors.append(floorFig);
    const tip3 = createTooltip(floorFig);
    const [fw, fh] = floor3.image_px;
    const svg3 = select(floorFig)
      .append('svg')
      .attr('viewBox', `0 0 ${fw} ${fh}`)
      .attr('role', 'img')
      .attr('aria-label', `The management floor: ${mgmt.categories.map((c) => `${c.label} ${count(c.posts)} posts`).join(', ')}`);
    svg3.append('image').attr('class', 'mgmt-floor__image').attr('href', floor3Url).attr('width', fw).attr('height', fh);
    // Floor names are HTML, so both read at the same size whatever each drawing's scale.
    floorFig.prepend(el('p', 'mgmt-floor__name', '3F · Management'));

    const totalPosts = mgmt.posts_total;
    const k = (fw * fh * 0.17) / (Math.PI * totalPosts); // circles cover ~17% of the image box
    const nodes = mgmt.categories.map((c, i) => ({ ...c, r: Math.sqrt(k * c.posts), x: SLOTS[i][0], y: SLOTS[i][1], tx: SLOTS[i][0], ty: SLOTS[i][1] }));
    const sim = forceSimulation(nodes)
      .force('x', forceX((d) => d.tx).strength(0.25))
      .force('y', forceY((d) => d.ty).strength(0.25))
      .force('collide', forceCollide((d) => d.r + 3).iterations(4))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();

    const circles = svg3
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'mgmt-circle')
      .attr('tabindex', 0)
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .attr('aria-label', (d) => `${d.label}: ${count(d.posts)} posts, ${percent(d.share)}`);
    circles.append('circle').attr('r', (d) => d.r).attr('fill', (d) => colorOf[d.key]);
    // As in Labor Scene 1: no outline, see-through at rest (the floor shows
    // through); the hovered circle comes up, the others recede.
    const focus = (key) => circles.classed('is-focus', (d) => d.key === key).classed('is-faded', (d) => key != null && d.key !== key);
    // Every circle is named (never colour alone): its share in white inside,
    // its name inside the big circle and to the right of the small ones.
    circles.each(function (d) {
      const g = select(this);
      const inside = d.r > 34;
      const lines = d.label.split(' & ').map((ln, i) => (i ? `& ${ln}` : ln));
      const name = g
        .append('text')
        .attr('class', `mgmt-circle__label${inside ? ' is-inside' : ''}`)
        .attr('text-anchor', inside ? 'middle' : 'start');
      lines.forEach((ln, i) =>
        name
          .append('tspan')
          .attr('x', inside ? 0 : d.r + 4)
          .attr('y', inside ? -8 + (i - lines.length + 1) * 12 : (i - (lines.length - 1) / 2) * 11 + 3.5)
          .text(ln)
      );
      g.append('text')
        .attr('class', 'mgmt-circle__pct')
        .attr('text-anchor', 'middle')
        .attr('y', inside ? 14 : 3.5)
        .style('font-size', inside ? '13px' : `${Math.max(8, Math.min(11, d.r * 0.5))}px`)
        .text(percent(d.share));
    });
    const showCircle = (event, d) => {
      const r = event.currentTarget.getBoundingClientRect();
      const f = floorFig.getBoundingClientRect();
      tip3.show(
        card(
          d.label,
          [
            ['Hiring posts', count(d.posts)],
            ['Share of posts', percent(d.share)],
            ...d.top_titles.map((t) => [t.title, count(t.posts)]),
          ],
          null
        ),
        { x: r.left + r.width / 2 - f.left, y: r.top - f.top + 6 }
      );
      focus(d.key);
    };
    circles.on('pointerenter focus', showCircle).on('pointerleave blur', () => {
      tip3.hide();
      focus(null);
    });

    // 1F floor (Scene 2's floor and dots), shown once "Compare pay" runs.
    const floor1Fig = el('figure', 'figure mgmt-floor mgmt-floor--line');
    floor1Fig.hidden = true;
    floors.append(floor1Fig);
    const [lw, lh] = floorData.line.image_px;
    const svg1 = select(floor1Fig).append('svg').attr('viewBox', `0 0 ${lw} ${lh}`).attr('role', 'img').attr('aria-label', 'The assembly floor, one dot per worker');
    svg1.append('image').attr('class', 'mgmt-floor__image mgmt-floor__image--line').attr('href', lineUrl).attr('width', lw).attr('height', lh);
    floor1Fig.prepend(el('p', 'mgmt-floor__name', '1F · Assembly line'));
    const lineDots = lineFloorDots(floorData.line, seededRandom(99));
    const fillOf = { insured: colorFor('regular'), dispatch: colorFor('dispatch') };
    const dotLayer = svg1
      .append('g')
      .selectAll('circle')
      .data(lineDots)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', LINE_DOT_R)
      .attr('fill', (d) => fillOf[d.kind]);

    // --- Side: categories + button, then the charts --------------------------
    const intro = el('div', 'mgmt-intro');
    const button = el('button', 'player-btn mgmt-compare', 'Compare pay');
    button.type = 'button';
    intro.append(button);
    side.append(intro);

    const charts = el('div', 'mgmt-charts');
    charts.hidden = true;
    side.append(charts);

    const lw$ = lineWorkerPay();
    const maxCny = Math.max(...mgmt.categories.map((c) => c.pay_median_monthly_cny), lw$.full.total, lw$.dispatch.total);
    const tipC = createTooltip(charts);
    const bars = {}; // key -> { bar, rect() }

    function barRow(parent, { key, label, total, segments, info, tipCard }) {
      const row = el('div', 'mgmt-bar');
      const name = el('p', 'mgmt-bar__name', label);
      if (info) {
        // (i): a few words on why the figure needs care, on hover / focus.
        const icon = el('span', 'mgmt-info', 'i');
        icon.tabIndex = 0;
        icon.setAttribute('role', 'img');
        icon.setAttribute('aria-label', info);
        const showInfo = (event) => {
          event.stopPropagation();
          const r = icon.getBoundingClientRect();
          const c = charts.getBoundingClientRect();
          tipC.show(card(info), { x: r.left + r.width / 2 - c.left, y: r.top - c.top });
        };
        icon.addEventListener('pointerenter', showInfo);
        icon.addEventListener('focus', showInfo);
        icon.addEventListener('pointerleave', () => tipC.hide());
        icon.addEventListener('blur', () => tipC.hide());
        name.append(' ', icon);
      }
      const track = el('div', 'mgmt-bar__track');
      const bar = el('div', 'mgmt-bar__fill');
      bar.dataset.width = String((total / maxCny) * 100 * BAR_SPAN);
      for (const s of segments) {
        const seg = el('div', `mgmt-bar__seg${s.hatch ? ' mgmt-bar__seg--hatch' : ''}`);
        seg.style.flexGrow = String(s.value);
        seg.style.setProperty('--seg', s.color);
        bar.append(seg);
      }
      const value = el('span', 'mgmt-bar__value', money(cnyToMoney(total)));
      track.append(bar, value);
      row.append(name, track);
      row.tabIndex = 0;
      const show = () => {
        const r = bar.getBoundingClientRect();
        const c = charts.getBoundingClientRect();
        tipC.show(tipCard(), { x: r.left + r.width / 2 - c.left, y: r.top - c.top });
      };
      row.addEventListener('pointerenter', show);
      row.addEventListener('focus', show);
      row.addEventListener('pointerleave', () => tipC.hide());
      row.addEventListener('blur', () => tipC.hide());
      parent.append(row);
      bars[key] = { bar, value, rect: () => track.getBoundingClientRect() };
    }

    // Chart A: white-collar posted pay.
    const chartA = el('div', 'mgmt-chart');
    chartA.append(el('p', 'chart-col__head', 'White collar: posted monthly pay'), el('p', 'mgmt-chart__sub', `Median, ${payYearsLabel}`));
    const rowsA = el('div', 'mgmt-chart__rows');
    chartA.append(rowsA);
    for (const c of mgmt.categories) {
      barRow(rowsA, {
        key: c.key,
        label: c.label,
        total: c.pay_median_monthly_cny,
        segments: [{ value: 1, color: colorOf[c.key] }],
        info: c.small_sample ? `Small sample: only ${count(c.pay_n)} posts list pay.` : null,
        tipCard: () =>
          card(c.label, [
            ['Median posted pay', `${money(cnyToMoney(c.pay_median_monthly_cny))} / month`],
            ['Posts with pay', count(c.pay_n)],
          ]),
      });
    }
    const legal = mgmt.pay_hours_per_week;
    chartA.append(hoursStrip(legal, legal, `${legal} h a week · legal standard`));
    // Dashed lines at the line workers' monthly pay (chart B's values, same
    // scale), so the gap to each white-collar bar reads directly.
    const refs = el('div', 'mgmt-refs');
    rowsA.append(refs);
    for (const [label, cny, color] of [
      ['Full-time (insured)', lw$.full.total, colorFor('regular')],
      ['Dispatch', lw$.dispatch.total, colorFor('dispatch')],
    ]) {
      const ln = el('div', 'mgmt-ref');
      ln.style.left = `${(cny / maxCny) * 100 * BAR_SPAN}%`;
      ln.style.setProperty('--ref', color);
      // Names only (the values are on chart B's bars), above the chart: the
      // first ends at its line, the second starts at its, so they never collide.
      ln.append(el('span', 'mgmt-ref__label', label));
      refs.append(ln);
    }

    // Chart B: line workers, from the wage calculator.
    const chartB = el('div', 'mgmt-chart');
    chartB.append(el('p', 'chart-col__head', 'Line workers: monthly pay'), el('p', 'mgmt-chart__sub', 'Estimated from China Labor Watch (CLW) 2025 data, before deductions'));
    const blue = colorFor('regular');
    const orange = colorFor('dispatch');
    const d = lw$.dispatch;
    barRow(chartB, {
      key: 'full',
      label: 'Full-time (insured)',
      total: lw$.full.total,
      segments: [{ value: 1, color: blue }],
      tipCard: () =>
        card('Full-time (insured)', [['Monthly pay', money(cnyToMoney(lw$.full.total))]]),
    });
    barRow(chartB, {
      key: 'dispatch',
      label: 'Dispatch',
      total: d.total,
      segments: [
        { value: d.paid, color: orange },
        { value: d.cond, color: orange, hatch: true },
      ],
      tipCard: () =>
        card('Dispatch', [
          ['Rebate-type', money(d.rebate.monthlyTotal)],
          ['Hourly-type', money(d.hourly.monthlyTotal)],
          ['Average', money(cnyToMoney(d.total))],
        ], 'Hatched: conditional pay (rebate or deferred wage).'),
    });


    const hrs = lw$.state.hoursPerWeek;
    chartB.append(hoursStrip(hrs, legal, `${hrs} h a week · ${hrs - legal} h more`));
    charts.append(chartA, chartB);

    // --- Headcount: how many white-collar workers there are -------------------
    const hc = mgmt.headcount;
    const headcount = el('div', 'mgmt-headcount');
    headcount.hidden = true;
    floors.append(headcount); // under the assembly floor
    headcount.append(el('p', 'chart-col__head', 'How many white-collar workers?'));
    const hcFig = el('figure', 'figure mgmt-hc__fig');
    headcount.append(hcFig);
    const tipH = createTooltip(hcFig);
    const R = 80; // modest: it only shows the difference in size
    const rOf = (n) => R * Math.sqrt(n / hc.clw_high);
    const S = 2 * R + 8;
    const cx = S / 2;
    const cy = S / 2;
    const svgH = select(hcFig).append('svg').attr('viewBox', `0 0 ${S + 132} ${S}`).attr('role', 'img').attr('aria-label', 'Nested circles comparing workforce counts');
    const sh = svgH.append('g');
    const shape = (cls, r, label) => sh.append('circle').attr('class', cls).attr('cx', cx).attr('cy', cy + R - r).attr('r', r).attr('data-key', label);
    shape('mgmt-hc__clw-band', rOf(hc.clw_high), 'clw');
    shape('mgmt-hc__clw-low', rOf(hc.clw_low), 'clw');
    shape('mgmt-hc__insured', rOf(hc.insured), 'insured').attr('fill', blue);
    shape('mgmt-hc__weighted', rOf(hc.revelio_weighted), 'weighted').attr('stroke', shades[0]);
    shape('mgmt-hc__raw', rOf(hc.revelio_raw), 'raw').attr('fill', shades[0]);
    const labels = [
      ['clw', `CLW est. ${count(hc.clw_low)}–${count(hc.clw_high)}`, cy - R + 4],
      ['insured', `Insured ${count(hc.insured)}`, cy + R - 2 * rOf(hc.insured) + 3],
      ['weighted', `Revelio est. ${count(Math.round(hc.revelio_weighted))}`, cy + R - 2 * rOf(hc.revelio_weighted) - 6],
      ['raw', `Revelio profiles ${count(Math.round(hc.revelio_raw))}`, cy + R - rOf(hc.revelio_raw) + 5],
    ];
    for (const [key, text, y] of labels) {
      sh.append('line').attr('class', 'mgmt-hc__leader').attr('x1', cx + 4).attr('x2', S + 4).attr('y1', y).attr('y2', y);
      sh.append('text').attr('class', 'mgmt-hc__label').attr('data-key', key).attr('x', S + 8).attr('y', y).attr('dy', '0.32em').text(text);
    }
    // One sentence per shape, on hover.
    const hcInfo = {
      clw: [`CLW estimate, ${hc.year}`, `China Labor Watch's estimate of everyone working in the airport-zone plants at peak season.`],
      insured: [`Insured, ${hc.year}`, 'Workers with work-injury insurance in the airport-zone plants: the ones on the books.'],
      weighted: ['Revelio weighted estimate', "Revelio's modelled guess at how many white-collar people there really are, scaled up from the profiles it found."],
      raw: ['Revelio raw profile count', 'Actual public career profiles (LinkedIn-type) of people working for Hon Hai in Zhengzhou.'],
    };
    const highlight = (key) => {
      svgH.selectAll('[data-key]').classed('is-dim', function () {
        return key && this.dataset.key !== key;
      });
    };
    svgH
      .selectAll('circle[data-key], text[data-key]')
      .on('pointerenter', (event) => {
        const key = event.currentTarget.dataset.key;
        highlight(key);
        const r = event.currentTarget.getBoundingClientRect();
        const f = hcFig.getBoundingClientRect();
        tipH.show(card(hcInfo[key][0], null, hcInfo[key][1]), { x: r.left + r.width / 2 - f.left, y: r.top - f.top });
      })
      .on('pointerleave', () => {
        highlight(null);
        tipH.hide();
      });

    addMethodNote(section, 'Sources and how to read it', [
      `Circles: number of hiring posts per job family, ${yearsLabel} (n = ${count(mgmt.posts_total)}); area is proportional to posts. Hover a circle for its share and specific job titles.`,
      `Hiring posts: ${mgmt.source}; ${count(mgmt.posts_total)} posts with usable pay, ${yearsLabel}. ${mgmt.category_note}`,
      `White-collar pay: ${mgmt.pay_note} Hours: ${mgmt.pay_hours_per_week} h/week is the legal standard week, an assumption, not something the posts state.`,
      `Line-worker pay: CLW 2025 via the wage calculator (Assembly Line), at its default settings, before deductions. Dispatch is the simple average of the rebate-type and hourly-type monthly totals.`,
      `Periods differ: white-collar pay ${payYearsLabel} (mostly 2021–22 posts); line-worker pay from CLW's 2025 report.`,
      `Headcount: Revelio covers all Hon Hai entities in the Zhengzhou metro area; CLW covers airport-zone plants only. Revelio's series barely changes from 2017 to 2025, so much of it is filled in by the model: read it as how little of the workforce is visible online, not as an exact headcount.`,
    ]);
    addCaveat(section, mgmt.caveat);
    container.replaceChildren(section);

    // Arriving from the floor index: the 3F floor flies from its spot there to here.
    const from = lastFloorClick('3F');
    if (from && !reducedMotion()) {
      const to = floorFig.getBoundingClientRect();
      floorFig.animate(
        [
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, transformOrigin: '0 0' },
          { transform: 'none', transformOrigin: '0 0' },
        ],
        { duration: 700, easing: 'cubic-bezier(.3,.7,.2,1)' }
      );
    }

    // --- Compare pay: floor 1F appears, both floors' dots flow into the bars ---
    let compared = false;
    const growBar = (key) => {
      const b = bars[key];
      if (!b) return;
      b.bar.style.width = `${b.bar.dataset.width}%`;
      b.value.classList.add('is-shown');
    };
    async function compare() {
      if (compared) return;
      compared = true;
      button.disabled = true;
      floor1Fig.hidden = false;
      charts.hidden = false;
      stage.classList.add('is-compared');
      // The assembly floor starts level with "Line workers: monthly pay".
      const headB = chartB.querySelector('.chart-col__head');
      const alignLine = () => {
        if (!floor1Fig.isConnected) return alignRo.disconnect();
        floor1Fig.style.marginTop = '0px';
        const d = headB.getBoundingClientRect().top - floor1Fig.getBoundingClientRect().top;
        floor1Fig.style.marginTop = `${Math.max(0, d)}px`;
      };
      const alignRo = new ResizeObserver(alignLine);
      alignRo.observe(charts);
      alignRo.observe(floorFig);
      intro.classList.add('is-done');
      const hourStrips = charts.querySelectorAll('.mgmt-hours');
      if (reducedMotion()) {
        Object.keys(bars).forEach(growBar);
        refs.classList.add('is-shown');
        hourStrips.forEach((h) => h.classList.add('is-shown'));
        headcount.hidden = false;
        return;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      floor1Fig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 450));
      const sources = [];
      circles.each(function (c) {
        const r = this.querySelector('circle').getBoundingClientRect();
        const n = Math.max(8, Math.round(c.posts / 6));
        sources.push({ key: c.key, color: colorOf[c.key], r: 2.2, from: circleDots(r.left + r.width / 2, r.top + r.height / 2, r.width / 2 - 3, n), target: bars[c.key].rect });
      });
      const fd = floorDotsOnScreen(svg1.node(), lineDots, LINE_DOT_R);
      sources.push({ key: 'full', color: blue, r: fd.r, from: fd.dots.insured, target: bars.full.rect });
      sources.push({ key: 'dispatch', color: orange, r: fd.r, from: fd.dots.dispatch, target: bars.dispatch.rect });
      dotLayer.attr('opacity', 0.25);
      circles.select('circle').attr('fill-opacity', 0.35);
      // The working weeks fill in, hour by hour, while the dots fly.
      hourStrips.forEach((h) => h.classList.add('is-shown'));
      await flowIntoBars(sources, { onLand: growBar });
      // The reference lines come in once every bar has grown.
      setTimeout(() => refs.classList.add('is-shown'), 650);
      circles.select('circle').attr('fill-opacity', null);
      dotLayer.attr('opacity', null);
      headcount.hidden = false;
    }
    button.addEventListener('click', compare);
  },
};
