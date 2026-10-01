import { easeCubicInOut } from 'd3';
import { colorFor } from '../lib/colorTokens.js';
import { seededRandom, lerp, bezier, toScreen, createOverlay, snapshot, scrollToScene } from './common.js';

// Transition 2 → 3: the floor plan — dots and all — shrinks into 1F of the
// floor index on the left. Then, as Scene 3's autoplay reaches each year, that
// year's dots stream out of 1F and stack into their bar, so the workforce chart
// builds one bar at a time. The dots are a motif, not a count: a Scene 3 dot is
// not 100 workers, so spare dots fade out inside the building and missing ones
// fade in as they leave it. Insured (blue) dots become the solid insured dots;
// dispatch (orange) dots become the ring "gap" dots.

const OUT_MS = 400; // the Scene 2 snapshot dissolves
const FLOOR_MS = 1150; // floor plan + dots shrink into the index
const FLOOR_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'; // = easeCubicInOut, so the dots ride the image exactly
const PULL_MS = [650, 900];
const PULL_STAGGER_MS = 260; // bottom dots of a bar land first, so it stacks upward
const ARC_PX = [40, 110]; // streams bow upward between the index and the chart
// 1F's slab in factory_exploded.png, as fractions of the image box.
const INDEX_1F = { cx: 0.5, cy: 0.835, width: 0.9 };

function floorDots(sceneEl) {
  const out = [];
  const layer = sceneEl.querySelector('.floor-dots');
  const svg = layer?.ownerSVGElement;
  if (!svg) return out;
  for (const c of layer.querySelectorAll('circle')) {
    const p = toScreen(svg, Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
    out.push({ kind: c.dataset.kind, x: p.x, y: p.y, r: Number(c.getAttribute('r')) * p.scale });
  }
  return out;
}

// Each filled (insured) or ring (gap) dot of the workforce chart, by year group.
function barDots(sceneEl) {
  const svg = sceneEl.querySelector('.workforce-figure svg');
  if (!svg) return null;
  const groups = [...svg.querySelectorAll('.yeardots')];
  const dots = [];
  let strokeW = 1;
  groups.forEach((g, yi) => {
    const mine = [];
    for (const c of g.querySelectorAll('.bar-dot:not(.bar-dot--empty)')) {
      const p = toScreen(svg, Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
      const ring = c.getAttribute('fill') === 'none';
      if (ring) strokeW = Number(c.getAttribute('stroke-width') || 1) * p.scale;
      mine.push({ kind: ring ? 'dispatch' : 'insured', ring, x: p.x, y: p.y, r: Number(c.getAttribute('r')) * p.scale, yi });
    }
    const ys = mine.map((d) => d.y);
    const bottom = Math.max(...ys);
    const span = Math.max(1, bottom - Math.min(...ys));
    for (const d of mine) d.rowFrac = (bottom - d.y) / span;
    dots.push(...mine);
  });
  return { groups, dots, strokeW };
}

// Pair two x-sorted lists evenly (left of the floor → early years); whatever is
// left over on either side is returned unpaired.
function pairEvenly(sources, targets) {
  const s = [...sources].sort((a, b) => a.x - b.x);
  const t = [...targets].sort((a, b) => a.yi - b.yi || b.y - a.y);
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

function draw(ctx, dots, strokeW) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
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
      ctx.lineWidth = strokeW;
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
    fromEl.querySelector('.floor-dots')?.style.setProperty('visibility', 'hidden');
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
    let strokeW = 1;
    let shrink = null; // { start, cx0, cy0, cx1, cy1, s }

    mounting = mountNext((el) => {
      sceneEl = el;
      sceneEl.style.animation = 'none';
      scrollToScene(root);

      const bars = barDots(sceneEl);
      const index = document.querySelector('#floor-nav-slot .floor-index__image svg');
      if (!bars || !index) return;
      strokeW = bars.strokeW;
      groups = bars.groups;
      for (const g of groups) g.classList.add('awaiting-dots');

      // Floor plan and dots share one transform into 1F of the index.
      const ir = index.getBoundingClientRect();
      shrink = {
        start: performance.now(),
        cx0: floorRect.left + floorRect.width / 2,
        cy0: floorRect.top + floorRect.height / 2,
        cx1: ir.left + ir.width * INDEX_1F.cx,
        cy1: ir.top + ir.height * INDEX_1F.cy,
        s: (ir.width * INDEX_1F.width) / floorRect.width,
      };
      const { cx0, cy0, cx1, cy1, s } = shrink;
      anims.push(
        flyer.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { opacity: 1, offset: 0.65 },
            { transform: `translate(${cx1 - cx0}px, ${cy1 - cy0}px) scale(${s})`, opacity: 0 },
          ],
          { duration: FLOOR_MS, easing: FLOOR_EASE, fill: 'forwards' }
        )
      );
      const inIndex = (p) => ({ x: cx1 + (p.x - cx0) * s, y: cy1 + (p.y - cy0) * s });

      dots = [];
      for (const kind of ['insured', 'dispatch']) {
        const { pairs, spareSources, spareTargets } = pairEvenly(
          sources.filter((p) => p.kind === kind),
          bars.dots.filter((t) => t.kind === kind)
        );
        const base = { color: colors[kind], x: 0, y: 0, a: 1, m: 0, landed: false };
        for (const [p, t] of pairs) dots.push({ ...base, from: p, hold: inIndex(p), target: t, r: p.r });
        // Spare floor dots ride into the building and fade there.
        for (const p of spareSources) dots.push({ ...base, from: p, hold: inIndex(p), target: null, r: p.r, spare: true });
        // Missing ones appear from a random spot on 1F as their bar is built.
        for (const t of spareTargets) {
          const p = sources[Math.floor(rng() * sources.length)];
          dots.push({ ...base, from: null, hold: inIndex(p), target: t, r: p.r * s, a: 0, spawn: true });
        }
      }
    });

    const committed = await mounting;
    if (!committed || !dots) return;

    // Each year's bar pulls its dots out of 1F when the autoplay reveals it.
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

    const holdR = (d) => (d.spawn ? d.r : d.from.r * shrink.s);

    await new Promise((resolve) => {
      const step = (now) => {
        if (skipped) return resolve();
        const t = now - shrink.start;

        while (pending.length) {
          const yi = pending.shift();
          for (const d of dots) {
            if (d.target?.yi !== yi) continue;
            const lift = lerp(ARC_PX[0], ARC_PX[1], rng());
            const p0 = d.spawn || t >= FLOOR_MS ? d.hold : { x: d.x, y: d.y };
            d.pull = {
              start: t + d.target.rowFrac * PULL_STAGGER_MS + rng() * 60,
              dur: lerp(PULL_MS[0], PULL_MS[1], rng()),
              r0: d.spawn ? d.r : holdR(d),
              curve: {
                p0,
                p1: { x: lerp(p0.x, d.target.x, 0.35), y: Math.min(p0.y, d.target.y) - lift },
                p2: { x: d.target.x, y: d.target.y - lift * 0.6 },
                p3: { x: d.target.x, y: d.target.y },
              },
            };
          }
        }

        const ride = easeCubicInOut(Math.min(1, t / FLOOR_MS));
        for (const d of dots) {
          if (d.landed) continue;
          if (d.pull && t >= d.pull.start) {
            const s = Math.min(1, (t - d.pull.start) / d.pull.dur);
            const u = easeCubicInOut(s);
            const p = bezier(d.pull.curve, u);
            d.x = p.x;
            d.y = p.y;
            d.r = lerp(d.pull.r0, d.target.r, u);
            d.m = d.target.ring ? u : 0;
            d.a = d.spawn ? Math.min(1, s * 3) : 1;
            if (s >= 1) d.landed = true;
            continue;
          }
          if (d.spawn) continue; // waits, unseen, until its bar is built
          d.x = lerp(d.from.x, d.hold.x, ride);
          d.y = lerp(d.from.y, d.hold.y, ride);
          d.r = lerp(d.from.r, holdR(d), ride);
          if (d.spare) {
            d.a = 1 - ride;
            if (ride >= 1) d.landed = true;
          }
        }

        // A bar's real dots appear the moment its last flying dot lands.
        for (let yi = 0; yi < lastReveal; yi++) {
          const g = groups[yi];
          if (g?.classList.contains('awaiting-dots') && dots.every((d) => d.target?.yi !== yi || d.landed)) {
            g.classList.remove('awaiting-dots');
          }
        }

        draw(overlay.ctx, dots, strokeW);
        if (dots.every((d) => d.landed)) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    sceneEl.removeEventListener('yearreveal', onReveal);
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
      for (const g of groups) g.classList.remove('awaiting-dots');
    });

  return { done, finish: skip };
}
