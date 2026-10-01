import { seededRandom, createOverlay, snapshot, scrollToScene } from './common.js';

// Transition 4 → 5: the wage calculator burns away from the bottom edge
// upward, revealing Scene 5's black ground — the page goes dark when pay
// fails. A still of Scene 4 (frozen in its light theme) is masked away along a
// ragged, noise-driven burn front; paper chars just ahead of the front, the
// front itself glows, and embers lift off it. Scene 5's own content fades in
// once most of the page is gone. Reduced motion: a quick fade to black.
// The flame is amber/yellow, never red (red is reserved for the legal cap).

const BURN_MS = 1500;
const EMBER_TAIL_MS = 450; // embers keep drifting after the last paper is gone
const SCENE_IN_AT = 0.6; // fraction of the burn when Scene 5's content fades in
const SCENE_IN_MS = 700;
const REDUCED_FADE_MS = 300;
const CELL = 6; // burn field resolution, px per cell
const NOISE_SHARE = 0.32; // how ragged the front is (0 = a straight line)
const CHAR_BAND = 0.07; // paper browns this far ahead of the front
const LICK = 0.012; // flames reach this far over the unburned paper
const FLAME_BAND = 0.065; // hot edge → orange flame → red smoulder, behind the front
const EMBERS_PER_FRAME = 34;
// Decorative, not a data color: the legal-cap red rule applies to chart marks only.
const COLORS = {
  char: [74, 24, 8],
  hot: [255, 206, 96],
  orange: [255, 104, 18],
  red: [196, 26, 10],
  embers: ['rgb(255, 176, 64)', 'rgb(255, 112, 28)', 'rgb(236, 58, 22)'],
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Flame color and strength across the band (s = 0 at the paper's edge, 1 at the cold end).
function flame(s) {
  const color = s < 0.25 ? mix(COLORS.hot, COLORS.orange, s / 0.25) : mix(COLORS.orange, COLORS.red, Math.min(1, (s - 0.25) / 0.4));
  const alpha = s < 0.08 ? s / 0.08 : s < 0.35 ? 1 : ((1 - s) / 0.65) * 0.85;
  return { color, alpha };
}

// Smooth seeded value noise, two octaves, in [0, 1].
function makeNoise(rng, cols, rows, scale) {
  const gw = Math.ceil(cols / scale) + 2;
  const gh = Math.ceil(rows / scale) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => rng());
  const smooth = (t) => t * t * (3 - 2 * t);
  const at = (x, y) => {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const v = (i, j) => grid[j * gw + i];
    const top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
    const bottom = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  return at;
}

export function fireBurn({ root, mountNext, reduced }) {
  let skipped = false;
  let overlay = null;
  let mounting = null;
  const anims = [];
  const skip = () => {
    skipped = true;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
  };

  const run = async () => {
    const fromEl = root.querySelector('.scene');
    overlay = createOverlay(skip);
    document.addEventListener('keydown', onKey);
    const ghost = snapshot(fromEl);
    overlay.wrap.prepend(ghost);

    let sceneEl = null;
    mounting = mountNext((el) => {
      sceneEl = el;
      sceneEl.style.animation = 'none';
      sceneEl.style.opacity = '0';
      scrollToScene(root);
    });
    if (!(await mounting)) return;

    const showScene = (ms) => {
      sceneEl.style.opacity = '';
      anims.push(sceneEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out', fill: 'backwards' }));
    };

    if (reduced) {
      anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_FADE_MS, easing: 'ease-in', fill: 'forwards' }));
      showScene(REDUCED_FADE_MS);
      await anims[0].finished;
      return;
    }

    // Burn field: each cell burns when progress passes its threshold —
    // bottom rows first, roughened by noise so the front is ragged.
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cols = Math.ceil(W / CELL);
    const rows = Math.ceil(H / CELL);
    const rng = seededRandom(5);
    const noise = makeNoise(rng, cols, rows, 12);
    const fine = makeNoise(rng, cols, rows, 4);
    const threshold = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = noise(i, j) * 0.75 + fine(i, j) * 0.25;
        threshold[j * cols + i] = (1 - j / rows) * (1 - NOISE_SHARE) + n * NOISE_SHARE;
      }
    }

    const mask = document.createElement('canvas');
    mask.width = cols;
    mask.height = rows;
    const mctx = mask.getContext('2d');
    const maskImg = mctx.createImageData(cols, rows);
    const maskSize = `${cols * CELL}px ${rows * CELL}px`;
    Object.assign(ghost.style, { maskSize, webkitMaskSize: maskSize, maskRepeat: 'no-repeat', webkitMaskRepeat: 'no-repeat' });

    const glow = document.createElement('canvas');
    glow.width = cols;
    glow.height = rows;
    const gctx = glow.getContext('2d');
    const glowImg = gctx.createImageData(cols, rows);

    const ctx = overlay.ctx;
    const embers = [];
    const pEnd = 1 + FLAME_BAND + 0.02; // every cell has burned and cooled
    let sceneShown = false;
    const t0 = performance.now();

    await new Promise((resolve) => {
      let last = t0;
      const step = (now) => {
        if (skipped) return resolve();
        const t = now - t0;
        const dt = Math.min(50, now - last) / 1000;
        last = now;
        const p = Math.min(pEnd, (t / BURN_MS) * pEnd);

        // Mask (paper left) and glow (char + flame) from one pass over the field.
        const burning = [];
        for (let k = 0; k < threshold.length; k++) {
          const d = p - threshold[k]; // > 0: burned
          const m = k * 4;
          maskImg.data[m + 3] = d > 0 ? 0 : 255;
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          if (d > -CHAR_BAND && d <= 0) {
            const c = 1 + d / CHAR_BAND; // 0 → 1 approaching the front
            [r, g, b] = COLORS.char;
            a = c * c * 170;
          }
          if (d > -LICK && d < FLAME_BAND) {
            const s = (d + LICK) / (FLAME_BAND + LICK);
            const f = flame(s);
            const flicker = 0.78 + 0.22 * Math.sin(t * 0.035 + k * 1.7);
            [r, g, b] = f.color;
            a = Math.max(a, 255 * f.alpha * flicker);
            if (s > 0.04 && s < 0.4) burning.push(k);
          }
          glowImg.data[m] = r;
          glowImg.data[m + 1] = g;
          glowImg.data[m + 2] = b;
          glowImg.data[m + 3] = a;
        }
        mctx.putImageData(maskImg, 0, 0);
        const url = `url(${mask.toDataURL()})`;
        ghost.style.maskImage = url;
        ghost.style.webkitMaskImage = url;
        gctx.putImageData(glowImg, 0, 0);

        // Embers lift off the burning edge, flicker and fade.
        for (let e = 0; e < EMBERS_PER_FRAME && burning.length; e++) {
          const k = burning[Math.floor(rng() * burning.length)];
          embers.push({
            x: ((k % cols) + rng()) * CELL,
            y: (Math.floor(k / cols) + rng()) * CELL,
            vx: (rng() - 0.5) * 40,
            vy: -60 - rng() * 140,
            life: 0,
            max: 0.5 + rng() * 0.8,
            r: 0.8 + rng() * 1.8,
            color: COLORS.embers[Math.floor(rng() * COLORS.embers.length)],
          });
        }

        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.filter = 'blur(5px)';
        ctx.drawImage(glow, 0, 0, cols * CELL, rows * CELL);
        // A wide additive halo so the flames bloom out over the dark.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.filter = 'blur(16px)';
        ctx.drawImage(glow, 0, 0, cols * CELL, rows * CELL);
        ctx.filter = 'none';
        for (let e = embers.length - 1; e >= 0; e--) {
          const em = embers[e];
          em.life += dt;
          if (em.life >= em.max) {
            embers.splice(e, 1);
            continue;
          }
          em.x += em.vx * dt + Math.sin(em.life * 12 + e) * 0.4;
          em.y += em.vy * dt;
          ctx.globalAlpha = (1 - em.life / em.max) * (0.6 + 0.4 * Math.sin(em.life * 30 + e));
          ctx.fillStyle = em.color;
          ctx.beginPath();
          ctx.arc(em.x, em.y, em.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';

        if (!sceneShown && p >= SCENE_IN_AT) {
          sceneShown = true;
          showScene(SCENE_IN_MS);
        }

        if (t >= BURN_MS + EMBER_TAIL_MS && embers.length === 0) resolve();
        else if (t >= BURN_MS + EMBER_TAIL_MS * 3) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  const done = run()
    .catch((err) => {
      console.error('Transition 4 → 5 failed; showing Scene 5 directly.', err);
      return mounting ?? mountNext();
    })
    .finally(() => {
      document.removeEventListener('keydown', onKey);
      for (const a of anims) a.finish();
      overlay?.wrap.remove();
      const scene = root.querySelector('.scene');
      if (scene) scene.style.opacity = '';
    });

  return { done, finish: skip };
}

fireBurn.hasReducedMotion = true;
