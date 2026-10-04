import { select, format, easeCubicInOut } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../introShell.js';
import { cssVar } from '../../lib/colorTokens.js';
import { createTooltip } from '../../lib/tooltip.js';
import hw from '../../../data/intro/hazardous_waste.json';

// One day on the left (trucks filling at each plant), one year on the right
// (Eiffel Towers). The towers fill from the first hour, slowly while the day's
// trucks load; after a short pause the trucks stay as the day left them and
// the year carries on in the towers alone. One tonnes scale runs through
// everything: a truck holds truck_payload_tonnes, the tonnes stack into the
// towers by plant, and a tower holds eiffel_total_tonnes. Towers fill by
// area: full when the silhouette is.

const count = format(',');
const one = format(',.1f');
// Two drawings side by side: the truck lanes (left, under the counters and
// caption) and the Eiffel Towers (right, as tall as the whole left column).
const W = 480; // lanes
const H = 236;
const WT = 510; // towers + their key
const HT = 410;
const DAY_MS = 2600; // one day of loading
const GAP_MS = 1800; // a short, smooth pause between the day and the year
const YEAR_MS = 7500; // 365 days
const YEAR_EASE = 2.2; // >1: the year starts slowly (day 2, day 3 ...) then speeds up
const TOTAL_MS = DAY_MS + GAP_MS + YEAR_MS;

// --- the tower: an original, detailed silhouette ----------------------------
// Half-width (share of the base half-width) by height share t, 0 = ground.
function halfWidth(t) {
  if (t < 0.24) return 1 - 0.38 * (t / 0.24) ** 0.8; // the four legs, curving in
  if (t < 0.265) return 0.74; // first platform deck
  if (t < 0.285) return 0.64;
  if (t < 0.47) return 0.6 - 0.24 * ((t - 0.285) / 0.185); // middle section
  if (t < 0.49) return 0.44; // second platform deck
  if (t < 0.5) return 0.38;
  if (t < 0.85) return 0.33 - 0.22 * ((t - 0.5) / 0.35) ** 0.9; // upper section
  if (t < 0.875) return 0.15; // top platform
  if (t < 0.905) return 0.1; // the lantern
  if (t < 0.94) return 0.065;
  return 0.03 * (1 - (t - 0.94) / 0.06) + 0.005; // the spire
}
const ARCH_T = 0.17;
const archHalf = (t) => (t < ARCH_T ? 0.6 * Math.sqrt(1 - (t / ARCH_T) ** 2) : 0);

const STEPS = 400;
const cumArea = (() => {
  const a = [0];
  for (let i = 1; i <= STEPS; i++) {
    const t = (i - 0.5) / STEPS;
    a.push(a[i - 1] + (halfWidth(t) - archHalf(t)) / STEPS);
  }
  return a.map((v) => v / a[STEPS]);
})();
function heightAt(f) {
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  let i = 1;
  while (cumArea[i] < f) i++;
  return (i - 1 + (f - cumArea[i - 1]) / (cumArea[i] - cumArea[i - 1])) / STEPS;
}

function towerOutline(cx, base, height, half) {
  const pts = [];
  for (let i = 0; i <= STEPS; i++) pts.push([cx + halfWidth(i / STEPS) * half, base - (i / STEPS) * height]);
  const right = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  const left = [...pts].reverse().map(([x, y]) => `${(2 * cx - x).toFixed(1)},${y.toFixed(1)}`);
  const arch = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI - (i / 40) * Math.PI;
    arch.push(`${(cx + Math.cos(a) * 0.6 * half).toFixed(1)},${(base - Math.sin(a) * ARCH_T * height).toFixed(1)}`);
  }
  return `M${right.join('L')}L${left.join('L')}Z M${arch.join('L')}Z`;
}

// Girders, platform decks and lattice drawn over the fill.
function towerDetail(g, cx, base, height, half) {
  const x = (t, side) => cx + side * halfWidth(t) * half;
  const y = (t) => base - t * height;
  const line = (x1, y1, x2, y2, cls = 'hw-lattice') => g.append('line').attr('class', cls).attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2);
  // Lattice X-bays in the legs (outer edge to arch / inner leg edge).
  for (const side of [-1, 1]) {
    const bays = [0.03, 0.09, 0.15, 0.2, 0.24];
    for (let i = 0; i < bays.length - 1; i++) {
      const [t1, t2] = [bays[i], bays[i + 1]];
      const inner = (t) => cx + side * Math.max(archHalf(t), halfWidth(t) * 0.55) * half;
      line(x(t1, side), y(t1), inner(t2), y(t2));
      line(inner(t1), y(t1), x(t2, side), y(t2));
    }
  }
  // Middle and upper sections: X-bays across each side, with a central post.
  const section = (t0, t1, n, inset) => {
    for (let i = 0; i < n; i++) {
      const a = t0 + ((t1 - t0) * i) / n;
      const b = t0 + ((t1 - t0) * (i + 1)) / n;
      for (const side of [-1, 1]) {
        const mid = (t) => cx + side * halfWidth(t) * half * inset;
        line(x(a, side), y(a), mid(b), y(b));
        line(mid(a), y(a), x(b, side), y(b));
      }
      line(x(b, -1), y(b), x(b, 1), y(b));
    }
    line(cx, y(t0), cx, y(t1));
  };
  section(0.285, 0.47, 4, 0.22);
  section(0.5, 0.85, 7, 0.18);
  // Platform decks.
  for (const [t, h] of [
    [0.24, 0.025],
    [0.47, 0.02],
    [0.85, 0.025],
  ]) {
    g.append('rect').attr('class', 'hw-deck').attr('x', x(t + h / 2, -1)).attr('y', y(t + h)).attr('width', 2 * halfWidth(t + h / 2) * half).attr('height', h * height);
  }
}

// A small truck: bed (with cargo) and cab. 74 x 40.
function truck(g, color) {
  const t = g.append('g').attr('class', 'hw-truck');
  t.append('rect').attr('class', 'hw-truck__bed').attr('width', 52).attr('height', 30).attr('rx', 2);
  const cargo = t.append('rect').attr('class', 'hw-truck__cargo').attr('x', 2).attr('width', 48).attr('rx', 1.5).attr('fill', color);
  t.append('path').attr('class', 'hw-truck__cab').attr('d', 'M55 8 h12 l7 9 v13 h-19 Z');
  for (const cx of [11, 41, 64]) t.append('circle').attr('class', 'hw-truck__wheel').attr('cx', cx).attr('cy', 33).attr('r', 4.5);
  return { g: t, cargo };
}

export default {
  id: 4,
  navLabel: 'Hazardous waste',

  mount(container) {
    const plants = hw.plants.filter((p) => p.tonnes_per_year != null);
    const missing = hw.plants.filter((p) => p.tonnes_per_year == null);
    const combined = plants.reduce((s, p) => s + p.tonnes_per_year, 0);
    const perDay = combined / hw.days_per_year;
    const trucksPerDay = perDay / hw.truck_payload_tonnes;
    const trucksPerYear = combined / hw.truck_payload_tonnes;
    const towers = combined / hw.eiffel_total_tonnes;
    const nTowers = Math.ceil(towers);

    const { el, body } = createScene({
      index: 4,
      title: 'How much hazardous waste?',
      summary: `The two airport-zone plants’ environmental impact assessments report about ${Math.round(perDay)} tonnes, or ${one(
        trucksPerDay
      )} truckloads of hazardous waste per day, and about ${one(towers)} Eiffel Towers by weight each year. ${hw.what_it_is}`,
    });


    const colors = Object.fromEntries(plants.map((p) => [p.key, cssVar(`--color-hw-${p.key}`)]));


    const counters = document.createElement('div');
    counters.className = 'prod-counters';
    const counter = (label) => {
      const wrap = document.createElement('div');
      const l = document.createElement('p');
      l.className = 'prod-counter__label';
      l.textContent = label;
      const v = document.createElement('p');
      v.className = 'prod-counter__value';
      wrap.append(l, v);
      counters.append(wrap);
      return v;
    };
    const timeC = counter('Time');
    const tonnesC = counter('Tonnes');
    const trucksC = counter('Truckloads');
    // Left column: counters, caption, lanes. Right column: the towers.
    const stage = document.createElement('div');
    stage.className = 'hw-stage';
    const left = document.createElement('div');
    left.className = 'hw-stage__left';
    stage.append(left);
    body.append(stage);
    left.append(counters);


    const caption = document.createElement('p');
    caption.className = 'prod-caption hw-caption';
    left.append(caption);

    const figure = document.createElement('figure');
    figure.className = 'figure hw-figure';
    left.append(figure);
    const towerFig = document.createElement('figure');
    towerFig.className = 'figure hw-towers';
    stage.append(towerFig);
    const tooltip = createTooltip(towerFig);
    const svgT = select(towerFig)
      .append('svg')
      .attr('viewBox', `0 0 ${WT} ${HT}`)
      .attr('preserveAspectRatio', 'xMinYMax meet')
      .attr('role', 'img')
      .attr('aria-label', `Eiffel Towers filled by one year of hazardous waste, about ${one(towers)} towers`);
    const svg = select(figure)
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('role', 'img')
      .attr(
        'aria-label',
        `At least ${count(Math.round(combined))} tonnes of hazardous waste a year from ${plants.length} plants, about ${one(towers)} Eiffel Towers by weight`
      );

    // --- one lane per plant: the truck being filled, then full trucks parked ---
    const LANE_Y = [44, 150];
    const LOAD_X = 150;
    const PARK_X = 245;
    const SLOT = 84;
    const lanes = plants.map((p, i) => {
      const g = svg.append('g').attr('transform', `translate(0, ${LANE_Y[i]})`);
      g.append('line').attr('class', 'hw-lane').attr('x1', 0).attr('x2', 470).attr('y1', 42).attr('y2', 42);
      g.append('text').attr('class', 'hw-lane__name').attr('x', 0).attr('y', 8).text(p.name);
      g.append('text').attr('class', 'hw-lane__sub').attr('x', 0).attr('y', 30).text(`≈ ${one(p.tonnes_per_year / hw.days_per_year)} t a day`);
      g.append('text').attr('class', 'hw-lane__sub').attr('x', LOAD_X).attr('y', 62).text('filling');
      const parkedLabel = g.append('text').attr('class', 'hw-lane__sub').attr('x', PARK_X).attr('y', 62).text('full, ready to go');
      const loading = truck(g.append('g').attr('transform', `translate(${LOAD_X}, 0)`), colors[p.key]);
      const parked = g.append('g');
      return { p, g, loading, parked, parkedLabel, y: LANE_Y[i] };
    });


    // --- towers, filled by plant on one tonnes scale --------------------------
    // As tall as the truck lanes beside them (top of the first lane name to
    // the bottom of the second lane's tally).
    const TOWER_H = 360;
    const BASE = 372;
    // The real tower is 330 m tall on a 125 m square base (about 2.6 : 1),
    // so the silhouette keeps that shape whatever its height.
    const HALF = Math.round(TOWER_H / (330 / 125) / 2);
    const towerX = Array.from({ length: nTowers }, (_, i) => 132 + i * (2 * HALF + 14));
    const topY = BASE - TOWER_H;
    const defs = svgT.append('defs');
    const levelY = (tonnes) => BASE - heightAt(tonnes / hw.eiffel_total_tonnes) * TOWER_H;
    const towerG = towerX.map((cx, i) => {
      const id = `hw-tower-${i}`;
      const d = towerOutline(cx, BASE, TOWER_H, HALF);
      defs.append('clipPath').attr('id', id).append('path').attr('d', d).attr('clip-rule', 'evenodd');
      const g = svgT.append('g');
      g.append('path').attr('class', 'hw-tower').attr('d', d).attr('fill-rule', 'evenodd');
      const fills = g.append('g').attr('clip-path', `url(#${id})`);
      const bands = plants.map((p) => fills.append('rect').attr('class', 'hw-band').attr('x', cx - HALF - 4).attr('width', HALF * 2 + 8).attr('fill', colors[p.key]).datum(p));
      towerDetail(g.append('g').attr('clip-path', `url(#${id})`), cx, BASE, TOWER_H, HALF);
      g.append('path').attr('class', 'hw-tower__line').attr('d', d).attr('fill-rule', 'evenodd');
      g.append('text').attr('class', 'hw-tower__label').attr('x', cx).attr('y', BASE + 18).attr('text-anchor', 'middle').text(`Eiffel Tower ${i + 1}`);
      g.append('text').attr('class', 'hw-tower__weight').attr('x', cx).attr('y', BASE + 34).attr('text-anchor', 'middle').text(`${count(hw.eiffel_total_tonnes)} t`);
      return { cx, bands };
    });
    // Each plant's year, beside the towers (its colour is its share of the fill).
    const keyX = towerX[towerX.length - 1] + HALF + 22;
    plants.forEach((p, i) => {
      const g = svgT.append('g').attr('class', 'hw-key').attr('transform', `translate(${keyX}, ${BASE - 150 + i * 60})`);
      g.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('y', -9).attr('fill', colors[p.key]);
      g.append('text').attr('class', 'hw-key__name').attr('x', 16).text(p.name);
      g.append('text').attr('class', 'hw-key__role').attr('x', 16).attr('y', 15).text(p.role);
      g.append('text').attr('class', 'hw-key__value').attr('x', 16).attr('y', 30).text(`${count(Math.round(p.tonnes_per_year))} t / yr`);
    });

    // Points at the thin first layer while the day plays.
    const dayMark = svgT
      .append('text')
      .attr('class', 'hw-lane__sub hw-daymark')
      .attr('x', towerX[0] - HALF - 6)
      .attr('y', BASE - 2)
      .attr('text-anchor', 'end')
      .text('one day →');

    const endText = hw.end_line.replace('{combined}', count(Math.floor(combined / 1000) * 1000)).replace('{multiple}', one(towers));

    const controls = document.createElement('div');
    controls.className = 'player-row';
    const btn = (text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'player-btn';
      b.textContent = text;
      controls.append(b);
      return b;
    };
    const playBtn = btn('Pause');
    const skipBtn = btn('Skip');
    const replayBtn = btn('Replay');
    // No Play / Skip / Replay on screen: the animation plays once in view.
    controls.hidden = true;
    body.append(controls);

    addMethodNote(el, 'Sources and math', [
      ...plants.map((p) => `${p.name}: ${count(p.tonnes_per_year)} t a year (${p.status}; ${p.basis}). Source: ${p.source}.${p.components ? ` Mostly ${p.components.map((c) => `${c.name} ${count(c.tonnes)} t`).join(', ')}.` : ''}`),
      ...missing.map((p) => `${p.name}: ${p.note}.`),
      `Combined at least ${count(Math.round(combined))} t ÷ ${hw.days_per_year} days ≈ ${one(perDay)} t a day ÷ ${hw.truck_payload_tonnes} t a truck ≈ ${one(trucksPerDay)} trucks a day, ${count(Math.round(trucksPerYear))} a year. ÷ ${count(hw.eiffel_total_tonnes)} t per Eiffel Tower ≈ ${one(towers)} towers. Eiffel Tower weight: Wikipedia.`,
      'Towers are filled by area: a tower is full when its silhouette is.',
    ]);
    addCaveat(el, hw.caveat);
    container.replaceChildren(el);

    // The whole screen fits one window: the drawing is never taller than the
    // room left once the heading, caption and notes are in place.
    const fit = () => {
      if (!figure.isConnected) return window.removeEventListener('resize', fit);
      const node = svg.node();
      node.style.maxHeight = '';
      const r = node.getBoundingClientRect();
      const section = figure.closest('.scene');
      const rootPad = parseFloat(getComputedStyle(section.parentElement).paddingBottom) || 0;
      const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      const below = section.getBoundingClientRect().bottom - r.bottom + rootPad + bodyPad;
      node.style.maxHeight = `${Math.max(200, window.innerHeight - (r.top + window.scrollY) - below - 2)}px`;
      // Both drawings are scaled to fit; their text is set in screen px
      // through these scales (and the plant names match the caption's size).
      const cap = getComputedStyle(caption).fontSize;
      const rl = node.getBoundingClientRect();
      node.style.setProperty('--hw-s', String(Math.min(rl.width / W, rl.height / H)));
      node.style.setProperty('--hw-cap', cap);
      const tn = svgT.node();
      const rt = tn.getBoundingClientRect();
      tn.style.setProperty('--hw-s', String(Math.min(rt.width / WT, rt.height / HT)));
    };
    window.addEventListener('resize', fit);
    requestAnimationFrame(fit);
    document.fonts?.ready.then(fit); // text reflows once the web fonts arrive
    // Refit if the left column's text changes height (e.g. the caption switch).
    const ro = new ResizeObserver(() => (figure.isConnected ? fit() : ro.disconnect()));
    ro.observe(caption);

    // --- one clock drives every view ------------------------------------------
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const plantTonnes = (p, days) => (p.tonnes_per_year / hw.days_per_year) * days;
    const parkedShown = new Map();

    function draw(t) {
      const inDay = t < DAY_MS;
      const yu = Math.min(1, Math.max(0, (t - DAY_MS - GAP_MS) / YEAR_MS));
      const days = inDay ? t / DAY_MS : 1 + yu ** YEAR_EASE * (hw.days_per_year - 1);
      const dayN = Math.max(1, Math.min(hw.days_per_year, Math.ceil(days)));
      dayMark.attr('opacity', t < DAY_MS + GAP_MS ? 1 : Math.max(0, 1 - (t - DAY_MS - GAP_MS) / 600));
      timeC.textContent = inDay ? `${String(Math.floor(days * 24)).padStart(2, '0')}:00` : `day ${count(dayN)}`;

      // The trucks show one day only; after it they stay as the day left them.
      const laneDays = Math.min(1, days);
      for (const ln of lanes) {
        const loaded = plantTonnes(ln.p, laneDays);
        const full = Math.floor(loaded / hw.truck_payload_tonnes);
        const inTruck = loaded - full * hw.truck_payload_tonnes;
        const h = 26 * (inTruck / hw.truck_payload_tonnes);
        ln.loading.cargo.attr('y', 2 + 26 - h).attr('height', h);
        // Each full truck parks beside the one being filled.
        const shown = full;
        ln.parkedLabel.attr('opacity', shown ? 1 : 0);
        if (parkedShown.get(ln) !== shown) {
          parkedShown.set(ln, shown);
          ln.parked.selectAll('*').remove();
          for (let k = 0; k < shown; k++) {
            const tk = truck(ln.parked.append('g').attr('transform', `translate(${PARK_X + k * SLOT}, 0)`), colors[ln.p.key]);
            tk.cargo.attr('y', 2).attr('height', 26);
          }
        }
      }

      // Towers: tonnes so far, stacked by plant in data order, tower after tower.
      const totals = plants.map((p) => plantTonnes(p, days));
      let below = 0;
      plants.forEach((p, k) => {
        const from = below;
        const to = below + totals[k];
        below = to;
        towerG.forEach((tw, i) => {
          const lo = Math.min(hw.eiffel_total_tonnes, Math.max(0, from - i * hw.eiffel_total_tonnes));
          const hi = Math.min(hw.eiffel_total_tonnes, Math.max(0, to - i * hw.eiffel_total_tonnes));
          const y1 = levelY(lo);
          const y2 = hi >= hw.eiffel_total_tonnes ? topY - 6 : levelY(hi);
          tw.bands[k].attr('y', y2).attr('height', Math.max(0, y1 - y2));
        });
      });
      const sum = totals.reduce((s, v) => s + v, 0);
      tonnesC.textContent = count(Math.round(sum));
      trucksC.textContent = one(sum / hw.truck_payload_tonnes);

      // The day: the daily rhythm; once the year runs, the year's total.
      caption.textContent = t >= TOTAL_MS ? endText : `The same ${one(trucksPerDay)} truckloads, every day for a year`;
      const done = t >= TOTAL_MS;
      if (done) {
        timeC.textContent = `day ${hw.days_per_year}`;
        tonnesC.textContent = count(Math.round(combined));
        trucksC.textContent = count(Math.round(trucksPerYear));
      }
    }

    // Hover / tap a fill: the plant, its year, and a short source (full one in the notes).
    svgT
      .selectAll('.hw-band')
      .on('pointerenter pointerdown', (event, p) => {
        const card = document.createElement('div');
        const title = document.createElement('p');
        title.className = 'tooltip__title';
        title.textContent = p.name;
        const list = document.createElement('dl');
        for (const [k, v] of [
          ['Tonnes/year', count(Math.round(p.tonnes_per_year))],
          ['Status', p.status],
        ]) {
          const dt = document.createElement('dt');
          dt.textContent = k;
          const dd = document.createElement('dd');
          dd.textContent = v;
          list.append(dt, dd);
        }
        const src = document.createElement('p');
        src.className = 'tooltip__note';
        src.textContent = `Source: ${p.source_short}`;
        card.append(title, list, src);
        const r = event.currentTarget.getBoundingClientRect();
        const f = towerFig.getBoundingClientRect();
        tooltip.show(card, { x: r.left + r.width / 2 - f.left, y: r.top - f.top + 10 });
      })
      .on('pointerleave', () => tooltip.hide());

    // --- playback --------------------------------------------------------------
    let elapsed = 0;
    let playing = false;
    let started = false;
    let last = null;
    const sync = () => {
      const done = elapsed >= TOTAL_MS;
      playBtn.textContent = playing ? 'Pause' : 'Play';
      playBtn.disabled = done;
      skipBtn.disabled = done;
    };
    function frame(now) {
      if (!figure.isConnected) return;
      if (playing) {
        elapsed = Math.min(TOTAL_MS, elapsed + (last == null ? 0 : now - last));
        if (elapsed >= TOTAL_MS) playing = false;
        sync();
      }
      last = now;
      draw(elapsed);
      if (playing) requestAnimationFrame(frame);
    }
    const play = () => {
      started = true;
      playing = true;
      last = null;
      sync();
      requestAnimationFrame(frame);
    };
    playBtn.addEventListener('click', () => {
      if (playing) {
        playing = false;
        sync();
      } else play();
    });
    skipBtn.addEventListener('click', () => {
      started = true;
      playing = false;
      elapsed = TOTAL_MS;
      draw(elapsed);
      sync();
    });
    replayBtn.addEventListener('click', () => {
      elapsed = 0;
      if (!playing) play();
    });

    if (reduced) {
      started = true;
      elapsed = TOTAL_MS;
      controls.hidden = true;
      draw(elapsed);
    } else {
      draw(0);
      sync();
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && !started) {
            io.disconnect();
            play();
          }
        },
        { threshold: 0.4 }
      );
      io.observe(figure);
    }
  },
};
