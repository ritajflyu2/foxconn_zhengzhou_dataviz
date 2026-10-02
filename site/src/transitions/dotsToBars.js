import { easeCubicInOut, interpolateRgb } from 'd3';
import { colorFor } from '../lib/colorTokens.js';
import { seededRandom, lerp, bezier, toScreen, createOverlay, snapshot, scrollToScene } from './common.js';

// Transition 2 → 3: the floor plan shrinks into 1F of the floor index on the
// left, while its dots lift off the floor into their own band of space opened
// between Scene 3's summary and its charts, keeping the floor's shape at a
// smaller size. Then, as Scene 3's autoplay reaches each year, that year's dots
// stream out of the band into BOTH charts, so each pair of bars builds one
// year at a time; once the last dot lands the band closes:
//   - workforce chart: insured (blue) → solid insured dots; dispatch (orange)
//     → ring "gap" dots;
//   - recruitment-post chart: insured (blue) → "regular" posts; dispatch
//     (orange) → rebate- and hourly-type dispatch posts, shifting to each
//     one's own orange on the way. Post types the floor has no dots for
//     (student, short-term) just appear in place.
// The dots are a motif, not a count: spare floor dots fade from the band a
// few each year (so the shape empties evenly), and missing ones fade in as they
// leave it.

const OUT_MS = 400; // the Scene 2 snapshot dissolves
const FLOOR_MS = 1150; // floor plan shrinks into the index
const FLOOR_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const GATHER_MS = [900, 1300]; // floor → band
const GATHER_SPREAD_MS = 300;
const BAND_H = [100, 170]; // height range of the band the dots wait in
const BAND_PAD = 10;
const BAND_MIN_R = 1.3; // smallest dot radius in the band
const BAND_CLOSE_MS = 500;
const ARROW_BAR_PX = 90; // keep the charts clear of the fixed arrow bar
const SPARE_FADE_MS = 500;
const WOBBLE_PX = 1.5;
const PULL_MS = [650, 900];
const PULL_STAGGER_MS = 260; // bottom dots of a bar land first, so it stacks upward
const ARC_PX = [20, 70];
const APPEAR_MS = 350; // in-place dots (no floor type) fade in
// 1F's slab in factory_exploded.png, as fractions of the image box.
const INDEX_1F = { cx: 0.5, cy: 0.835, width: 0.9 };

// Which floor-dot type feeds each recruitment-post type (null = none: appears in place).
const POST_SOURCE = { regular: 'insured', rebate_dispatch: 'dispatch', hourly_dispatch: 'dispatch', student: null, short_term: null };

// Every dot of every `.floor-dots` layer: the assembly lines and the dorm beds.
function floorDots(sceneEl) {
  const out = [];
  for (const layer of sceneEl.querySelectorAll('.floor-dots')) {
    const svg = layer.ownerSVGElement;
    for (const c of layer.querySelectorAll('circle')) {
      const p = toScreen(svg, Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
      out.push({ kind: c.dataset.kind, x: p.x, y: p.y, r: Number(c.getAttribute('r')) * p.scale });
    }
  }
  return out;
}

// Every visible dot of one chart, by year group, with its target look.
function chartDots(svg, chart, kindOf) {
  const groups = [...svg.querySelectorAll('.yeardots')];
  const dots = [];
  groups.forEach((g, yi) => {
    const mine = [];
    for (const c of g.querySelectorAll('.bar-dot:not(.bar-dot--empty)')) {
      const p = toScreen(svg, Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
      const ring = c.getAttribute('fill') === 'none';
      mine.push({
        chart,
        yi,
        kind: kindOf(c, ring),
        ring,
        color: ring ? c.getAttribute('stroke') : c.getAttribute('fill'),
        strokeW: ring ? Number(c.getAttribute('stroke-width') || 1) * p.scale : 0,
        x: p.x,
        y: p.y,
        r: Number(c.getAttribute('r')) * p.scale,
      });
    }
    const ys = mine.map((d) => d.y);
    const bottom = Math.max(...ys);
    const span = Math.max(1, bottom - Math.min(...ys));
    for (const d of mine) d.rowFrac = (bottom - d.y) / span;
    dots.push(...mine);
  });
  return { groups, dots };
}

function barTargets(sceneEl) {
  const left = sceneEl.querySelector('.workforce-figure svg');
  const right = sceneEl.querySelector('.posts-figure svg');
  if (!left || !right) return null;
  const a = chartDots(left, 'workforce', (_c, ring) => (ring ? 'dispatch' : 'insured'));
  const b = chartDots(right, 'posts', (c) => POST_SOURCE[c.closest('.bar-segment')?.dataset.kind] ?? null);
  return { groups: [...a.groups, ...b.groups], groupsByChart: { workforce: a.groups, posts: b.groups }, dots: [...a.dots, ...b.dots] };
}

// Pair two lists evenly; whatever is left over on either side is returned unpaired.
function pairEvenly(sources, targets) {
  const s = [...sources].sort((a, b) => a.x - b.x);
  const t = [...targets].sort((a, b) => a.yi - b.yi || a.x - b.x || b.y - a.y);
  const pairs = [];
  const usedS = new Set();
  const usedT = new Set();
  const n = Math.min(s.length, t.length);
  for (let i = 0; i < n; i++) {
    const si = s.length > t.length ? Math.floor((i * s.length) / n) : i;
    const ti = t.length > s.length ? Math.floor((i * t.length) / n) : i;
    pairs.push([s[si], t[ti]]);
    usedS.add(si);
    usedT.add(ti);
  }
  return { pairs, spareSources: s.filter((_, i) => !usedS.has(i)), spareTargets: t.filter((_, i) => !usedT.has(i)) };
}

// Fits the floor's dot pattern into the band, keeping its shape.
function bandMapper(sources, band) {
  const xs = sources.map((p) => p.x);
  const ys = sources.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((band.width - 2 * BAND_PAD) / Math.max(1, x1 - x0), (band.height - 2 * BAND_PAD) / Math.max(1, y1 - y0));
  const cx = band.left + band.width / 2;
  const cy = band.top + band.height / 2;
  // One dot size in the band: the floor's own (smallest) dots, scaled.
  const r = Math.max(BAND_MIN_R, Math.min(...sources.map((p) => p.r)) * k);
  return (p) => ({ x: cx + (p.x - (x0 + x1) / 2) * k, y: cy + (p.y - (y0 + y1) / 2) * k, r });
}

// Positions are recorded at scroll `scroll0`; drawing shifts them by however
// far the page has scrolled since, so waiting and flying dots move with the
// page (the band and the charts) instead of sitting fixed over the text.
function draw(ctx, dots, scroll0) {
  ctx.setTransform(ctx.getTransform().a, 0, 0, ctx.getTransform().d, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.translate(0, scroll0 - window.scrollY);
  for (const d of dots) {
    if (d.landed || d.a <= 0.01) continue;
    const fillA = d.a * (1 - d.m);
    if (fillA > 0.01) {
      ctx.globalAlpha = fillA;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d.m > 0.01) {
      ctx.globalAlpha = d.a * d.m;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.target.strokeW;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function dotsToBars({ root, mountNext }) {
  let skipped = false;
  let overlay = null;
  let mounting = null;
  let sceneEl = null;
  let groups = [];
  let groupsByChart = {};
  let band = null;
  const anims = [];
  const skip = () => {
    skipped = true;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
  };

  const run = async () => {
    const fromEl = root.querySelector('.scene');
    const sources = floorDots(fromEl);
    const floorImg = fromEl.querySelector('.floor-plan-image');
    const floorRect = floorImg?.getBoundingClientRect();
    if (!floorRect) throw new Error('No floor plan to shrink');
    const colors = { insured: colorFor('regular'), dispatch: colorFor('dispatch') };
    const rng = seededRandom(23);

    // The canvas and the flying floor plan replace their originals in the still.
    fromEl.querySelectorAll('.floor-dots').forEach((l) => l.style.setProperty('visibility', 'hidden'));
    floorImg.style.setProperty('visibility', 'hidden');

    overlay = createOverlay(skip);
    document.addEventListener('keydown', onKey);
    const ghost = snapshot(fromEl);
    overlay.wrap.prepend(ghost);
    anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: 'ease-in-out', fill: 'forwards' }));

    const flyer = document.createElement('img');
    flyer.className = 'transition-floor';
    flyer.alt = '';
    flyer.src = floorImg.getAttribute('href');
    Object.assign(flyer.style, {
      left: `${floorRect.left}px`,
      top: `${floorRect.top}px`,
      width: `${floorRect.width}px`,
      height: `${floorRect.height}px`,
    });
    ghost.after(flyer);

    let dots = null;
    let t0 = null;
    let scroll0 = 0;

    mounting = mountNext((el) => {
      sceneEl = el;
      sceneEl.style.animation = 'none';

      // Open the band between the summary and the charts, then make sure the
      // charts still fit above the arrow bar (scrolling the title up if needed).
      const charts = sceneEl.querySelector('.scene3-layout');
      band = document.createElement('div');
      band.className = 'transition-band';
      band.setAttribute('aria-hidden', 'true');
      band.style.height = `${Math.round(Math.min(BAND_H[1], Math.max(BAND_H[0], window.innerHeight * 0.18)))}px`;
      charts?.before(band);
      scrollToScene(root);
      const overflow = (charts?.getBoundingClientRect().bottom ?? 0) - (window.innerHeight - ARROW_BAR_PX);
      if (overflow > 0) window.scrollBy(0, Math.min(overflow, band.getBoundingClientRect().top - 8));
      const toBand = bandMapper(sources, band.getBoundingClientRect());
      t0 = performance.now();
      scroll0 = window.scrollY;

      const bars = barTargets(sceneEl);
      const index = document.querySelector('#floor-nav-slot .floor-index__image svg');
      if (!bars || !index) return;
      groups = bars.groups;
      groupsByChart = bars.groupsByChart;
      for (const g of groups) g.classList.add('awaiting-dots');

      // The floor plan (without its dots) shrinks into 1F of the index.
      const ir = index.getBoundingClientRect();
      const s = (ir.width * INDEX_1F.width) / floorRect.width;
      const dx = ir.left + ir.width * INDEX_1F.cx - (floorRect.left + floorRect.width / 2);
      const dy = ir.top + ir.height * INDEX_1F.cy - (floorRect.top + floorRect.height / 2);
      anims.push(
        flyer.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { opacity: 1, offset: 0.65 },
            { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 },
          ],
          { duration: FLOOR_MS, easing: FLOOR_EASE, fill: 'forwards' }
        )
      );

      // Pair floor dots with chart dots by type; spares on either side handled below.
      const travelling = [];
      const spawns = [];
      const spares = [];
      for (const kind of ['insured', 'dispatch']) {
        const { pairs, spareSources, spareTargets } = pairEvenly(
          sources.filter((p) => p.kind === kind),
          bars.dots.filter((t) => t.kind === kind)
        );
        for (const [p, t] of pairs) travelling.push({ from: p, target: t, color0: colors[kind] });
        for (const p of spareSources) spares.push({ from: p, color0: colors[kind] });
        for (const t of spareTargets) spawns.push({ target: t, color0: colors[kind] });
      }

      // Every floor dot keeps its own place in the floor's shape, scaled into the band.
      const years = groupsByChart.workforce.length;
      const gather = () => ({ delay: rng() * GATHER_SPREAD_MS, dur: lerp(GATHER_MS[0], GATHER_MS[1], rng()), phase: rng() * Math.PI * 2 });
      const randomSlot = () => toBand(sources[Math.floor(rng() * sources.length)]);

      dots = [
        ...travelling.map((d) => ({ ...d, ...gather(), slot: toBand(d.from), mode: 'travel', x: d.from.x, y: d.from.y, r: d.from.r, a: 1, m: 0 })),
        // Spare floor dots wait in the band too, and fade a few each year.
        ...spares.map((d) => ({ ...d, ...gather(), slot: toBand(d.from), fadeYear: Math.floor(rng() * years), mode: 'spare', x: d.from.x, y: d.from.y, r: d.from.r, a: 1, m: 0 })),
        // Missing ones of a floor type fade in as they leave the band.
        ...spawns.map((d) => ({ ...d, ...gather(), slot: randomSlot(), mode: 'spawn', x: 0, y: 0, r: BAND_MIN_R, a: 0, m: 0 })),
        // Post types with no floor dots just appear in place.
        ...bars.dots.filter((t) => t.kind == null).map((t) => ({ target: t, color0: t.color, mode: 'appear', x: t.x, y: t.y, r: t.r, a: 0, m: 0 })),
      ];
      for (const d of dots) {
        d.color = d.color0;
        d.mix = d.target ? interpolateRgb(d.color0, d.target.color) : null;
      }
    });

    const committed = await mounting;
    if (!committed || !dots) return;

    // Each year's bars (both charts) pull their dots when the autoplay reveals it.
    let lastReveal = 0;
    const pending = [];
    const onReveal = (e) => {
      const { revealCount, playing, total } = e.detail;
      // Pausing or scrubbing hands control back to the viewer: finish now.
      if (revealCount < lastReveal || revealCount > lastReveal + 1 || (!playing && revealCount < total)) {
        skip();
        return;
      }
      for (let yi = lastReveal; yi < revealCount; yi++) pending.push(yi);
      lastReveal = revealCount;
    };
    sceneEl.addEventListener('yearreveal', onReveal);

    const bandPos = (d, t) => {
      const u = easeCubicInOut(Math.min(1, Math.max(0, (t - d.delay) / d.dur)));
      const wob = { x: Math.sin(t / 420 + d.phase) * WOBBLE_PX * u, y: Math.cos(t / 530 + d.phase) * WOBBLE_PX * u };
      if (d.mode === 'spawn') return { x: d.slot.x + wob.x, y: d.slot.y + wob.y, u: 1 };
      const p = bezier({ p0: d.from, p1: { x: d.from.x, y: d.from.y - 80 }, p2: { x: d.slot.x, y: d.slot.y + 60 }, p3: d.slot }, u);
      return { x: p.x + wob.x, y: p.y + wob.y, u };
    };

    await new Promise((resolve) => {
      const step = (now) => {
        if (skipped) return resolve();
        const t = now - t0;

        while (pending.length) {
          const yi = pending.shift();
          for (const d of dots) {
            if (d.mode === 'spare') {
              if (d.fadeYear === yi && !d.fade) d.fade = { start: t + rng() * 400 };
              continue;
            }
            if (d.target?.yi !== yi || d.pull) continue;
            const start = t + d.target.rowFrac * PULL_STAGGER_MS + rng() * 60;
            if (d.mode === 'appear') {
              d.pull = { start, dur: APPEAR_MS };
              continue;
            }
            const cur = d.mode === 'spawn' ? d.slot : { x: d.x, y: d.y };
            const lift = lerp(ARC_PX[0], ARC_PX[1], rng());
            d.pull = {
              start,
              dur: lerp(PULL_MS[0], PULL_MS[1], rng()),
              r0: d.mode === 'spawn' ? d.slot.r : d.r,
              curve: {
                p0: cur,
                p1: { x: cur.x, y: cur.y - lift },
                p2: { x: d.target.x, y: d.target.y - 60 - lift },
                p3: { x: d.target.x, y: d.target.y },
              },
            };
          }
        }

        for (const d of dots) {
          if (d.landed) continue;
          if (d.pull && t >= d.pull.start) {
            const s = Math.min(1, (t - d.pull.start) / d.pull.dur);
            if (d.mode === 'appear') {
              d.a = s;
            } else {
              const u = easeCubicInOut(s);
              const p = bezier(d.pull.curve, u);
              d.x = p.x;
              d.y = p.y;
              d.r = lerp(d.pull.r0, d.target.r, u);
              d.m = d.target.ring ? u : 0;
              d.color = d.mix(u);
              d.a = d.mode === 'spawn' ? Math.min(1, s * 3) : 1;
            }
            if (s >= 1) d.landed = true;
            continue;
          }
          if (d.mode === 'spawn' || d.mode === 'appear') continue; // unseen until its bar is built
          const p = bandPos(d, t);
          d.x = p.x;
          d.y = p.y;
          d.r = lerp(d.from.r, d.slot.r, p.u);
          if (d.fade) {
            d.a = 1 - Math.min(1, Math.max(0, (t - d.fade.start) / SPARE_FADE_MS));
            if (d.a <= 0) d.landed = true;
          }
        }

        // A chart's bar for a year appears the moment its last flying dot lands.
        for (let yi = 0; yi < lastReveal; yi++) {
          for (const [chart, list] of Object.entries(groupsByChart)) {
            const g = list[yi];
            if (g?.classList.contains('awaiting-dots') && dots.every((d) => d.target?.chart !== chart || d.target.yi !== yi || d.landed)) {
              g.classList.remove('awaiting-dots');
            }
          }
        }

        draw(overlay.ctx, dots, scroll0);
        if (dots.every((d) => d.landed)) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    sceneEl.removeEventListener('yearreveal', onReveal);

    // Every dot has landed: close the band so the page settles into Scene 3's own layout.
    if (!skipped && band) {
      band.style.transition = `height ${BAND_CLOSE_MS}ms ease`;
      band.style.height = '0px';
      await new Promise((r) => setTimeout(r, BAND_CLOSE_MS));
    }
  };

  const done = run()
    .catch((err) => {
      console.error('Transition 2 → 3 failed; showing Scene 3 directly.', err);
      return mounting ?? mountNext();
    })
    .finally(() => {
      document.removeEventListener('keydown', onKey);
      for (const a of anims) a.finish();
      overlay?.wrap.remove();
      band?.remove();
      for (const g of groups) g.classList.remove('awaiting-dots');
    });

  return { done, finish: skip };
}
