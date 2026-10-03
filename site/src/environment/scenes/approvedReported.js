import { select, max, format } from 'd3';
import { addCaveat, addMethodNote } from '../../lib/sceneShell.js';
import { cssVar } from '../../lib/colorTokens.js';
import { seededRandom } from '../../transitions/common.js';
import { two, reducedMotion, createScene, playerControls, counter } from '../shared.js';
import data from '../../../data/environment/approved_reported.json';

// Approved and reported: what Hongfujin reported each year (permit execution
// reports) against the design budget its approvals set. Three forms side by
// side, all redrawn each year: water (COD) and ammonia nitrogen as tanks of
// one approved year each, air (VOCs) as a particle cloud inside the approved
// budget's circle. Same player as Expansion (Labor Scene 3's, at its pace).

const pct = format('.0%');
const VB = 300; // each form's viewBox is VB tall; its width fits its own content
const REM_PER_UNIT = 17 / VB; // drawn size: VB units -> rem, the same scale for all three forms
const TANK = { w: 54, h: 66, gapX: 14, gapY: 30 };
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
  const subs = [0, 1].map((i) => svg.append('text').attr('class', 'env-form__tag').attr('x', x).attr('y', y + 18 + i * 13).attr('text-anchor', 'middle'));
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
  const width = 260;
  const cx = width / 2;
  const cy = 152;
  const R = 100;
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
  const setRatio = ratioLine(svg, cx, cy + R + 34);
  return { width, update: (v) => {
    const r = v / s.approved;
    const rr = R * Math.sqrt(r);
    const n = Math.round(v);
    setRatio(r >= 1 ? `${r.toFixed(1)}×` : pct(r), r >= 1 ? 'the approved budget' : 'of the approved budget');
    const t = (sel) => (reducedMotion() ? sel : sel.transition().duration(STEP_MS));
    t(fill).attr('r', rr);
    t(dots)
      .attr('cx', ([ux]) => cx + ux * Math.max(0, rr - 3))
      .attr('cy', ([, uy]) => cy + uy * Math.max(0, rr - 3))
      .attr('opacity', (_d, i) => (i < n ? 1 : 0));
  } };
}

export default {
  id: 2,
  navLabel: 'Approved and reported',

  mount(container) {
    const years = data.years;
    const byKey = Object.fromEntries(data.streams.map((s) => [s.key, s]));
    const { el, head, body } = createScene(2);
    head.querySelector('h2').textContent = 'Over on water. Under on air.';
    const last = years.length - 1;
    head.querySelector('.scene__summary').textContent = `The approvals in Expansion set a design budget for each stream. Here is what Hongfujin reported against it each year, ${years[0]}–${years[last]}: by ${years[last]}, COD was ${ratioNote(byKey.cod, byKey.cod.reported[last])}, ammonia nitrogen ${ratioNote(byKey.nh3, byKey.nh3.reported[last])}, and VOCs ${ratioNote(byKey.voc, byKey.voc.reported[last])}.`;

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
      const key = document.createElement('p');
      key.className = 'env-form__key';
      key.textContent = s.key === 'voc' ? `Dashed circle = the approved ${two(s.approved)} t/year · 1 dot = 1 t reported` : `1 tank = the approved ${two(s.approved)} t/year`;
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
      svg.attr('viewBox', `0 0 ${forms[s.key].width} ${VB}`);
    }

    // Each column is as wide as its form at the shared scale, so the gaps
    // between the three are just the grid gap.
    row.style.gridTemplateColumns = data.streams.map((s) => `minmax(0, ${(forms[s.key].width * REM_PER_UNIT).toFixed(2)}rem)`).join(' ');

    // 3. The year player (Labor Scene 3's), from the first report year.
    const player = playerControls(body, {
      years: years.map((year) => ({ year })),
      secondsPerYear: data.animation.seconds_per_year,
      onReveal(revealCount) {
        const i = Math.max(0, revealCount - 1);
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
    ]);
    addCaveat(el, data.caveat);
    container.replaceChildren(el);

    // Autoplay once the forms are in view (reduced motion: the end state, no autoplay).
    if (!reducedMotion()) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            if (row.isConnected) player.play();
          }
        },
        { threshold: 0.25 }
      );
      io.observe(row);
    }
  },
};
