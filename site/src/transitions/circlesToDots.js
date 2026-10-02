import { colorFor } from '../lib/colorTokens.js';
import { seededRandom, lerp, bezier, createOverlay, snapshot, scrollToScene } from './common.js';

// Transition 1 → 2: each plant circle dissolves into its own worker dots
// (insured dots from the blue core, dispatch dots from the orange band, counts
// from scene2_floor.json `by_plant`), which stream straight onto Scene 2's
// floor and land on its real dots. Drawn on one fixed canvas; 1,500+ animated
// DOM nodes would stutter.
//
// Motion never stops: every dot bursts outward the moment the user clicks
// (no waiting on Scene 2 to load), then hands off — at its current speed and
// heading — into a curve that settles onto its floor position.

const APPEAR_MS = 140; // dots fade in over the circles
const OUT_MS = 520; // the Scene 1 snapshot dissolves into Scene 2
const BURST_TAU_MS = 240; // how quickly the outward burst slows
const BURST_PX = [30, 110]; // outward travel if the burst ran to completion
const HANDOFF_SPREAD_MS = 160; // dots peel off into their curves at slightly different times
const FLIGHT_MS = [950, 1450];
const LIFT_PX = [20, 110]; // dots come down onto the floor from slightly above
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Even sunflower spiral over a disc (r0 = 0) or a ring (r0 > 0), equal area per dot.
// Each point keeps its circle centre and how far out it sits (0 = centre, 1 = edge).
function spiral(cx, cy, r0, r1, rEdge, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n;
    const r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * f);
    const a = k * GOLDEN;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), cx, cy, edge: r / rEdge });
  }
  return out;
}

function sourceDots(sceneEl, byPlant) {
  const dots = { insured: [], dispatch: [] };
  let minSpacing = Infinity;
  for (const g of sceneEl.querySelectorAll('g.plant[data-plant-id]')) {
    const plant = byPlant.find((p) => p.id === g.dataset.plantId);
    if (!plant) continue;
    const m = g.getScreenCTM();
    const scale = Math.hypot(m.a, m.b);
    const rIns = Number(g.dataset.rInsured) * scale;
    const rLow = Number(g.dataset.rLow) * scale;
    dots.insured.push(...spiral(m.e, m.f, 0, rIns, rLow, plant.insured_dots));
    dots.dispatch.push(...spiral(m.e, m.f, rIns, rLow, rLow, plant.dispatch_dots));
    minSpacing = Math.min(minSpacing, Math.sqrt((Math.PI * rLow * rLow) / plant.dots));
  }
  return { dots, startR: Number.isFinite(minSpacing) ? minSpacing * 0.42 : 2 };
}

// Every dot of every `.floor-dots` layer (Scene 2 has the lines and the dorm
// beds), each with its own on-screen radius.
function targetDots(sceneEl) {
  const dots = { insured: [], dispatch: [] };
  let endR = 3;
  for (const layer of sceneEl.querySelectorAll('.floor-dots')) {
    const m = layer.ownerSVGElement.getScreenCTM();
    const scale = Math.hypot(m.a, m.b);
    for (const c of layer.querySelectorAll('circle')) {
      if (!dots[c.dataset.kind]) continue;
      const x = Number(c.getAttribute('cx'));
      const y = Number(c.getAttribute('cy'));
      const r = Number(c.getAttribute('r')) * scale;
      dots[c.dataset.kind].push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, r });
      endR = Math.min(endR === 3 ? r : endR, r);
    }
  }
  return { dots, endR };
}

// Outward from the circle centre, turned a little off-radial so it swirls.
// Outer dots push further, so the circle visibly comes apart from its edge.
function burstOf(p, rng) {
  const dx = p.x - p.cx;
  const dy = p.y - p.cy;
  const len = Math.hypot(dx, dy) || 1;
  const swirl = (rng() - 0.5) * 1.1;
  const ux = (dx / len) * Math.cos(swirl) - (dy / len) * Math.sin(swirl);
  const uy = (dx / len) * Math.sin(swirl) + (dy / len) * Math.cos(swirl);
  const amp = lerp(BURST_PX[0], BURST_PX[1], rng()) * (0.45 + 0.55 * Math.min(1, p.edge));
  return { ux, uy, amp };
}

// Exponential slow-down: moving at full speed at t = 0, never fully still.
function burstAt(d, t) {
  const k = Math.exp(-t / BURST_TAU_MS);
  return {
    x: d.from.x + d.b.ux * d.b.amp * (1 - k),
    y: d.from.y + d.b.uy * d.b.amp * (1 - k),
    vx: (d.b.ux * d.b.amp * k) / BURST_TAU_MS,
    vy: (d.b.uy * d.b.amp * k) / BURST_TAU_MS,
  };
}

// Cubic from the handoff point to the floor. The first control point carries
// the burst velocity forward (with u = easeOutQuad(s), B'(0)·du/dt = v), so the
// handoff is seamless; the ease-out lands each dot softly.
function curveFrom(h, to, duration, rng) {
  const k = duration / 6;
  return {
    p0: { x: h.x, y: h.y },
    p1: { x: h.x + h.vx * k, y: h.y + h.vy * k },
    p2: { x: to.x + (rng() - 0.5) * 70, y: to.y - lerp(LIFT_PX[0], LIFT_PX[1], rng()) },
    p3: to,
  };
}

// Pair left-to-right so each plant's dots travel as one stream instead of crossing.
function pairTargets(sources, targets) {
  const byX = (a, b) => a.from.x - b.from.x || a.from.y - b.from.y;
  const s = [...sources].sort(byX);
  const t = [...targets].sort((a, b) => a.x - b.x || a.y - b.y);
  s.forEach((d, i) => {
    d.to = t[i] ?? null;
  });
}

// Every dot of one color in a single path.
function draw(ctx, layers, alpha) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.globalAlpha = alpha;
  for (const { color, dots } of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const d of dots) {
      if (d.gone) continue;
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// `mountNext(onCommit)` mounts Scene 2 and calls onCommit(sceneEl) synchronously
// the moment it is on the page (before paint); resolves false if the user had
// already navigated elsewhere.
export function circlesToDots({ root, toData, mountNext }) {
  let skipped = false;
  let overlay = null;
  let mounting = null;
  let dotLayers = [];
  let fade = null;
  const skip = () => {
    skipped = true;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
  };

  const run = async () => {
    const fromEl = root.querySelector('.scene');
    const { dots: src, startR } = sourceDots(fromEl, toData.by_plant);
    const colors = { insured: colorFor('regular'), dispatch: colorFor('dispatch') };
    const rng = seededRandom();

    overlay = createOverlay(skip);
    document.addEventListener('keydown', onKey);
    const ghost = snapshot(fromEl);
    overlay.wrap.prepend(ghost);
    fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: 'ease-in-out', fill: 'forwards' });

    const layers = Object.entries(src).map(([kind, pts]) => ({
      kind,
      color: colors[kind],
      dots: pts.map((p) => ({ from: p, b: burstOf(p, rng), x: p.x, y: p.y, r: startR })),
    }));

    const t0 = performance.now();
    let endR = startR;
    let targetsAt = null; // ms after t0 when the floor positions became known

    mounting = mountNext((sceneEl) => {
      dotLayers = [...sceneEl.querySelectorAll('.floor-dots')];
      for (const l of dotLayers) l.style.visibility = 'hidden';
      // The floor image dims as the dots start landing on it.
      setTimeout(() => sceneEl.querySelector('.scene2-floor')?.classList.add('is-populated'), 500);
      sceneEl.style.animation = 'none';
      scrollToScene(root);

      const target = targetDots(root);
      endR = target.endR;
      targetsAt = performance.now() - t0;
      for (const layer of layers) {
        pairTargets(layer.dots, target.dots[layer.kind]);
        for (const d of layer.dots) {
          d.handoff = targetsAt + rng() * HANDOFF_SPREAD_MS;
          d.duration = lerp(FLIGHT_MS[0], FLIGHT_MS[1], rng());
        }
      }
    });

    await new Promise((resolve) => {
      const step = (now) => {
        if (skipped) return resolve();
        const t = now - t0;
        let landed = targetsAt != null;
        for (const layer of layers) {
          for (const d of layer.dots) {
            if (targetsAt == null || t < d.handoff) {
              const p = burstAt(d, t);
              d.x = p.x;
              d.y = p.y;
              landed = false;
              continue;
            }
            if (!d.to) {
              d.gone = true; // more source dots than floor dots: let the extra one go
              continue;
            }
            if (!d.curve) d.curve = curveFrom(burstAt(d, d.handoff), d.to, d.duration, rng);
            const s = Math.min(1, (t - d.handoff) / d.duration);
            if (s < 1) landed = false;
            const u = 1 - (1 - s) * (1 - s);
            const p = bezier(d.curve, u);
            d.x = p.x;
            d.y = p.y;
            d.r = lerp(startR, d.to.r ?? endR, u);
          }
        }
        draw(overlay.ctx, layers, Math.min(1, t / APPEAR_MS));
        if (landed) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      mounting.then((ok) => {
        if (!ok) skip();
      });
    });

    await mounting;
  };

  const done = run()
    .catch((err) => {
      console.error('Transition 1 → 2 failed; showing Scene 2 directly.', err);
      return mounting ?? mountNext();
    })
    .finally(() => {
      document.removeEventListener('keydown', onKey);
      fade?.finish();
      overlay?.wrap.remove();
      for (const l of dotLayers) l.style.visibility = '';
    });

  return { done, finish: skip };
}
