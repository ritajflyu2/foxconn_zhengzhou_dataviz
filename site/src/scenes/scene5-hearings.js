import { select, easeCubicInOut } from 'd3';
import { createScene, addCaveat } from '../lib/sceneShell.js';
import { createTooltip } from '../lib/tooltip.js';
import { count, percent } from '../lib/format.js';

// A separate dark-mode palette for dispute category — deliberately not the
// worker-type colors (blue/orange/aqua), since this scene encodes case type,
// not worker type, and reusing blue would wrongly suggest "insured". Validated
// with the dataviz skill's validate_palette.js --mode dark --surface #0f0f0f
// --pairs all: every check passes (worst all-pairs CVD ΔE 6.5, in the 6-8
// band that requires secondary encoding — satisfied here by the always-on
// legend + direct category text in every hover card, never color alone).
const DISPUTE_COLORS = {
  'Labor & employment': '#d55181',
  'Commercial contract': '#c98500',
  'Personal injury / rights': '#9085e9',
  'Intellectual property': '#1fa8ab',
  'Other / administrative': '#008300',
};

const YEAR_COLS = 5; // fixed columns per year block, so block height ∝ count
const CELL = 11;
const GAP = 2;
const PITCH = CELL + GAP;
const BLOCK_GAP = 16;
const TYPE_COLS = 12; // wider blocks when sorted by case type, so the largest stays low
const TYPE_GAP = 26;
const LABEL_ROW = 72; // block labels (case types: two lines plus a count) and room below the cubes
const SORT_MS = 800;
const SORT_STAGGER_MS = 250;

function partyLine(p) {
  return `${p.role}: ${p.name}${p.outcome ? ` (${p.outcome})` : ''}`;
}

function detailCard(c) {
  const wrap = document.createElement('div');
  wrap.className = 'hearing-card';

  const title = document.createElement('p');
  title.className = 'hearing-card__title';
  title.textContent = c.cause;
  wrap.append(title);

  const meta = document.createElement('p');
  meta.className = 'hearing-card__meta';
  meta.textContent = `${c.date} · ${c.category} · ${c.entity}`;
  wrap.append(meta);

  const court = document.createElement('p');
  court.className = 'hearing-card__line';
  court.textContent = c.court;
  wrap.append(court);

  const parties = document.createElement('p');
  parties.className = 'hearing-card__line';
  parties.textContent = c.parties.map(partyLine).join(' · ');
  wrap.append(parties);

  const link = document.createElement('a');
  link.className = 'hearing-card__source';
  link.href = c.source_url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Source: Qichacha court-notice listing (Chinese)';
  wrap.append(link);

  return wrap;
}

function legend(categories, counts) {
  const el = document.createElement('ul');
  el.className = 'legend legend--dark';
  for (const cat of categories) {
    const li = document.createElement('li');
    li.className = 'legend__item';
    const sw = document.createElement('span');
    sw.className = 'legend__swatch';
    sw.style.background = DISPUTE_COLORS[cat];
    const label = document.createElement('span');
    label.textContent = cat;
    const value = document.createElement('span');
    value.className = 'legend__value';
    value.textContent = count(counts[cat] ?? 0);
    li.append(sw, label, value);
    el.append(li);
  }
  return el;
}

export default {
  id: 4,
  navLabel: 'When pay fails',
  colorKey: 'legal-cap',

  mount(container, data) {
    // Where labor disputes take off: the first year with more than twice as
    // many labor hearings as any year before it; the text says "after" the year before.
    const laborCat = data.categories[0];
    const laborByYear = new Map();
    for (const c of data.cases) if (c.category === laborCat) laborByYear.set(c.year, (laborByYear.get(c.year) ?? 0) + 1);
    const allYears = [...new Set(data.cases.map((c) => c.year))].sort((a, b) => a - b);
    let peak = 0;
    let riseYear = null;
    for (const y of allYears) {
      const n = laborByYear.get(y) ?? 0;
      if (peak && n > 2 * peak) {
        riseYear = y;
        break;
      }
      peak = Math.max(peak, n);
    }
    const { el, body } = createScene({
      index: 4,
      title: 'When pay fails: the disputes',
      summary: `Based on publicly available hearing announcements, labor and employment disputes increase after ${allYears[allYears.indexOf(riseYear) - 1]}. The majority of hearings are about labor & employment dispute. Hover over a cube for more details on the case.`,
    });

    const { labor_share, total } = data.headline;
    const headline = document.createElement('div');
    headline.className = 'dispute-headline';
    const headlineValue = document.createElement('p');
    headlineValue.className = 'dispute-headline__value';
    headlineValue.textContent = percent(labor_share);
    const headlineNote = document.createElement('p');
    headlineNote.className = 'dispute-headline__note';
    headlineNote.textContent = `of hearing announcements are ${laborCat.toLowerCase()} disputes.`;
    headline.append(headlineValue, headlineNote);
    body.append(headline);

    const categoryCounts = {};
    for (const c of data.cases) categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1;
    body.append(legend(data.categories, categoryCounts));

    // Two layouts of the same cubes: by year (a block per year, sorted by
    // category within it so same-type cubes cluster) or by case type (a block
    // per category, oldest first). Switching animates every cube to its new place.
    const catIndex = (c) => data.categories.indexOf(c.category);
    const groupBy = (keyOf, keys, sortKey) =>
      keys.map((k) => ({ key: k, cases: data.cases.filter((c) => keyOf(c) === k).sort((a, b) => sortKey(a) - sortKey(b) || a.date.localeCompare(b.date)) }));
    const years = [...new Set(data.cases.map((c) => c.year))].sort((a, b) => a - b);
    const LAYOUTS = {
      year: { cols: YEAR_COLS, gap: BLOCK_GAP, blocks: groupBy((c) => c.year, years, catIndex) },
      type: { cols: TYPE_COLS, gap: TYPE_GAP, blocks: groupBy((c) => c.category, data.categories, () => 0) },
    };
    const blockW = (L) => L.cols * PITCH;
    const widthOf = (L) => L.blocks.length * (blockW(L) + L.gap) - L.gap;
    const rowsOf = (L) => Math.max(...L.blocks.map((b) => Math.ceil(b.cases.length / L.cols)));
    const W = Math.max(...Object.values(LAYOUTS).map(widthOf));
    const plotHeight = Math.max(...Object.values(LAYOUTS).map(rowsOf)) * PITCH;
    const H = plotHeight + LABEL_ROW;

    // Each case's top-left corner in a layout; blocks centred across the width.
    const place = (L) => {
      const pos = new Map();
      const x0 = (W - widthOf(L)) / 2;
      L.blocks.forEach((b, bi) => {
        const bx = x0 + bi * (blockW(L) + L.gap);
        b.cases.forEach((c, i) => {
          const row = Math.floor(i / L.cols);
          pos.set(c, { x: bx + (i % L.cols) * PITCH, y: plotHeight - (row + 1) * PITCH });
        });
        b.cx = bx + blockW(L) / 2;
      });
      return pos;
    };

    let mode = 'year';
    const sortControl = document.createElement('div');
    sortControl.className = 'control-row control-row--compact dispute-sort';
    const sortLabel = document.createElement('p');
    sortLabel.className = 'control-row__label';
    sortLabel.textContent = 'Sort by';
    const sortGroup = document.createElement('div');
    sortGroup.className = 'toggle-group';
    const sortButtons = Object.entries({ year: 'Year', type: 'Case type' }).map(([key, text]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toggle-group__item';
      b.textContent = text;
      b.setAttribute('aria-pressed', String(key === mode));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setMode(key);
      });
      sortGroup.append(b);
      return [key, b];
    });
    sortControl.append(sortLabel, sortGroup);
    body.append(sortControl);

    const figure = document.createElement('figure');
    figure.className = 'figure dispute-figure';
    body.append(figure);

    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr('aria-label', `${count(total)} hearing announcements, ${years[0]} to ${years[years.length - 1]}, grouped by year and colored by dispute category`);

    const tooltip = createTooltip(figure);
    let pinned = null;
    // Beside the cube, never over it; the figure lets the card overflow.
    const cardAt = (node, d) => {
      const r = node.getBoundingClientRect();
      tooltip.showBeside(detailCard(d), { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    };
    const hideCard = () => {
      if (!pinned) tooltip.hide();
    };

    let pos = place(LAYOUTS[mode]);
    svg
      .append('g')
      .selectAll('rect')
      .data(data.cases)
      .join('rect')
      .attr('class', 'hearing-cube')
      .attr('x', (d) => pos.get(d).x)
      .attr('y', (d) => pos.get(d).y)
      .attr('width', CELL)
      .attr('height', CELL)
      .attr('rx', 1.5)
      .attr('fill', (d) => DISPUTE_COLORS[d.category])
      .attr('tabindex', 0)
      .attr('role', 'img')
      .attr('aria-label', (d) => `${d.date}: ${d.cause} (${d.category})`)
      .on('pointerenter', function (event, d) {
        cardAt(this, d);
      })
      .on('pointerleave', hideCard)
      .on('focus', function (event, d) {
        cardAt(this, d);
      })
      .on('blur', hideCard)
      .on('click', function (event, d) {
        event.stopPropagation();
        if (pinned === d) {
          pinned = null;
          tooltip.hide();
        } else {
          pinned = d;
          cardAt(this, d);
        }
      });

    // Block labels under each layout's blocks: year numbers, or category names
    // (wrapped after a slash so they fit their block).
    const labels = svg.append('g');
    const drawLabels = () => {
      const L = LAYOUTS[mode];
      labels.selectAll('text').remove();
      for (const b of L.blocks) {
        const t = labels
          .append('text')
          .attr('class', mode === 'type' ? 'dispute-year-label dispute-type-label' : 'dispute-year-label')
          .attr('x', b.cx)
          .attr('y', plotHeight + 20)
          .attr('text-anchor', 'middle');
        const lines = mode === 'type' ? String(b.key).split(/(?<=\/)\s+/) : [String(b.key)];
        lines.forEach((line, k) => t.append('tspan').attr('x', b.cx).attr('dy', k ? '1.2em' : 0).text(line));
        // By case type: the block's count under its name.
        if (mode === 'type') t.append('tspan').attr('class', 'dispute-type-label__count').attr('x', b.cx).attr('dy', '1.35em').text(count(b.cases.length));
      }
    };
    drawLabels();

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      for (const [key, b] of sortButtons) b.setAttribute('aria-pressed', String(key === mode));
      pinned = null;
      tooltip.hide();
      pos = place(LAYOUTS[mode]);
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const cubes = svg.selectAll('rect.hearing-cube');
      (reduced ? cubes : cubes.transition().duration(SORT_MS).delay(() => Math.random() * SORT_STAGGER_MS).ease(easeCubicInOut))
        .attr('x', (d) => pos.get(d).x)
        .attr('y', (d) => pos.get(d).y);
      labels.interrupt().attr('opacity', 0);
      drawLabels();
      (reduced ? labels : labels.transition().delay(SORT_MS * 0.6).duration(300)).attr('opacity', 1);
      svg.attr('aria-label', `${count(total)} hearing announcements, grouped by ${mode === 'year' ? 'year' : 'case type'} and colored by dispute category`);
    }

    // Scoped to this scene's own element, not `document` — there's no unmount
    // hook to remove a document-level listener when the scene is switched
    // away from, so it would otherwise accumulate on every re-visit.
    el.addEventListener('click', () => {
      pinned = null;
      tooltip.hide();
    });

    addCaveat(el, data.caveat);

    container.replaceChildren(el);
  },
};
