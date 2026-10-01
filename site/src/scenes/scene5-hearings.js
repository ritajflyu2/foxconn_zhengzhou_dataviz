import { select } from 'd3';
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

function cubeCenters(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / YEAR_COLS);
    const col = i % YEAR_COLS;
    out.push([col * PITCH, -(row + 1) * PITCH]); // bottom-up, relative to the block's baseline
  }
  return out;
}

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
  id: 5,
  navLabel: 'When pay fails',
  colorKey: 'legal-cap',

  mount(container, data) {
    const { el, body } = createScene({
      index: 5,
      title: 'When pay fails: the disputes',
      summary:
        'One cube per hearing announcement, 2015–2026, colored by dispute type. Hover a cube for that case; tap to open the same card on a touch device.',
    });

    const { labor_share, labor_count, total } = data.headline;
    const headline = document.createElement('div');
    headline.className = 'dispute-headline';
    const headlineValue = document.createElement('p');
    headlineValue.className = 'dispute-headline__value';
    headlineValue.textContent = percent(labor_share);
    const headlineNote = document.createElement('p');
    headlineNote.className = 'dispute-headline__note';
    headlineNote.textContent = `${count(labor_count)} of ${count(total)} hearing announcements are labor & employment disputes.`;
    headline.append(headlineValue, headlineNote);
    body.append(headline);

    const categoryCounts = {};
    for (const c of data.cases) categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1;
    body.append(legend(data.categories, categoryCounts));

    // Group cases into year columns, sorted by category within each year so
    // same-category cubes cluster visually (as in the dot-grid poster ref).
    const byYear = new Map();
    for (const c of data.cases) {
      if (!byYear.has(c.year)) byYear.set(c.year, []);
      byYear.get(c.year).push(c);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    for (const y of years) {
      byYear.get(y).sort((a, b) => data.categories.indexOf(a.category) - data.categories.indexOf(b.category));
    }

    const blockWidth = YEAR_COLS * PITCH;
    const maxRows = Math.max(...years.map((y) => Math.ceil(byYear.get(y).length / YEAR_COLS)));
    const plotHeight = maxRows * PITCH;
    const W = years.length * (blockWidth + BLOCK_GAP) - BLOCK_GAP;
    const H = plotHeight + 40; // + year-label row

    const figure = document.createElement('figure');
    figure.className = 'figure dispute-figure';
    body.append(figure);

    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img')
      .attr('aria-label', `${count(total)} hearing announcements, 2015 to 2026, grouped by year and colored by dispute category`);

    const tooltip = createTooltip(figure);
    const scaleAt = (sx, sy) => {
      const r = figure.getBoundingClientRect();
      return { x: sx * (r.width / W), y: sy * (r.height / H) };
    };

    let pinned = null;
    const showCard = (c, anchorX, anchorY) => tooltip.show(detailCard(c), scaleAt(anchorX, anchorY));
    const hideCard = () => {
      if (!pinned) tooltip.hide();
    };

    years.forEach((year, yi) => {
      const cases = byYear.get(year);
      const x0 = yi * (blockWidth + BLOCK_GAP);
      const baseline = plotHeight;
      const centers = cubeCenters(cases.length);

      const g = svg.append('g').attr('transform', `translate(${x0}, ${baseline})`);

      g.selectAll('rect')
        .data(cases)
        .join('rect')
        .attr('class', 'hearing-cube')
        .attr('x', (d, i) => centers[i][0])
        .attr('y', (d, i) => centers[i][1])
        .attr('width', CELL)
        .attr('height', CELL)
        .attr('rx', 1.5)
        .attr('fill', (d) => DISPUTE_COLORS[d.category])
        .attr('tabindex', 0)
        .attr('role', 'img')
        .attr('aria-label', (d) => `${d.date}: ${d.cause} (${d.category})`)
        .on('pointerenter', function (event, d) {
          const i = cases.indexOf(d);
          showCard(d, x0 + centers[i][0] + CELL / 2, baseline + centers[i][1]);
        })
        .on('pointerleave', hideCard)
        .on('focus', function (event, d) {
          const i = cases.indexOf(d);
          showCard(d, x0 + centers[i][0] + CELL / 2, baseline + centers[i][1]);
        })
        .on('blur', hideCard)
        .on('click', function (event, d) {
          event.stopPropagation();
          const i = cases.indexOf(d);
          if (pinned === d) {
            pinned = null;
            tooltip.hide();
          } else {
            pinned = d;
            showCard(d, x0 + centers[i][0] + CELL / 2, baseline + centers[i][1]);
          }
        });

      svg
        .append('text')
        .attr('class', 'dispute-year-label')
        .attr('x', x0 + blockWidth / 2)
        .attr('y', plotHeight + 20)
        .attr('text-anchor', 'middle')
        .text(year);
    });

    // Scoped to this scene's own element, not `document` — there's no unmount
    // hook to remove a document-level listener when the scene is switched
    // away from, so it would otherwise accumulate on every re-visit.
    el.addEventListener('click', () => {
      pinned = null;
      tooltip.hide();
    });

    const note = document.createElement('p');
    note.className = 'dispute-note';
    note.textContent = data.interaction;
    figure.append(note);

    addCaveat(el, data.caveat);

    const closing = document.createElement('p');
    closing.className = 'dispute-closing';
    closing.textContent = 'End of the Labor page.';
    el.append(closing);

    container.replaceChildren(el);
  },
};
