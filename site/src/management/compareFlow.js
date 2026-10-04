import { seededRandom, lerp, bezier, toScreen, createOverlay } from '../transitions/common.js';

// "Compare pay": the dots of both floors lift off and flow into the bars.
// Same machinery as the Labor transitions (one fixed canvas overlay with its
// Skip control, cubic flight paths, a seeded random): management circles
// break into dots that fly to their category's bar; the assembly floor's
// worker dots fly to the full-time (insured) or dispatch bar. The dots are a
// motif, not a count. Resolves when every dot has landed (or on Skip).

const FLIGHT_MS = [900, 1300];
const STAGGER_MS = 700;
const MAX_FLOOR_DOTS = 420; // a sample of the floor's 1,320 is plenty to read as a stream
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Dots filling a circle (sunflower spiral), in screen px.
function circleDots(cx, cy, r, n) {
  return Array.from({ length: n }, (_, k) => {
    const d = r * Math.sqrt((k + 0.5) / n);
    const a = k * GOLDEN;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  });
}

// A point inside a bar's box (screen rect), so arriving dots spread along it.
const inBar = (rect, rng) => ({ x: rect.left + rect.width * (0.15 + 0.8 * rng()), y: rect.top + rect.height * (0.2 + 0.6 * rng()) });

/**
 * sources: [{ color, r (screen px), from: [{x,y}], target: () => DOMRect }]
 */
export function flowIntoBars(sources, { onLand } = {}) {
  let skipped = false;
  const overlay = createOverlay(() => {
    skipped = true;
  });
  const rng = seededRandom(23);
  const dots = [];
  for (const s of sources) {
    const rect = s.target();
    for (const p of s.from) {
      dots.push({
        color: s.color,
        r: s.r,
        p0: p,
        p3: inBar(rect, rng),
        lift: 40 + rng() * 80,
        delay: rng() * STAGGER_MS,
        dur: lerp(FLIGHT_MS[0], FLIGHT_MS[1], rng()),
        key: s.key,
      });
    }
  }
  for (const d of dots) {
    d.curve = { p0: d.p0, p1: { x: d.p0.x, y: d.p0.y - d.lift }, p2: { x: d.p3.x - 60, y: d.p3.y - d.lift * 0.4 }, p3: d.p3 };
  }
  const landedKeys = new Set();
  const t0 = performance.now();
  const end = Math.max(...dots.map((d) => d.delay + d.dur), 0);
  const done = new Promise((resolve) => {
    const step = (now) => {
      const t = now - t0;
      const ctx = overlay.ctx;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const d of dots) {
        const u = Math.min(1, Math.max(0, (t - d.delay) / d.dur));
        if (u >= 1) {
          if (!landedKeys.has(d.key)) {
            landedKeys.add(d.key);
            onLand?.(d.key);
          }
          continue;
        }
        const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
        const p = bezier(d.curve, e);
        ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (skipped || t >= end) {
        for (const s of sources) onLand?.(s.key);
        overlay.wrap.remove();
        resolve();
      } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return done;
}

// The assembly floor's dots on screen, sampled evenly, grouped by kind.
export function floorDotsOnScreen(svg, dotsData, r) {
  const every = Math.max(1, Math.ceil(dotsData.length / MAX_FLOOR_DOTS));
  const out = { insured: [], dispatch: [] };
  dotsData.forEach((d, i) => {
    if (i % every) return;
    const p = toScreen(svg, d.x, d.y);
    out[d.kind]?.push({ x: p.x, y: p.y });
  });
  const scale = toScreen(svg, 0, 0).scale;
  return { dots: out, r: Math.max(1.4, r * scale) };
}

export { circleDots };
