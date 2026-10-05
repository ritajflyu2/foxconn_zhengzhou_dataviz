import { simFrame, simReady, simSceneRect } from './simManager.js';

// "Explore the Electronics Manufacturing Ecosystem": the four floors of the
// floor index fly to the middle of the screen and stack into the simulator's
// building (4F at the top, 1F at the bottom), landing where the simulator draws
// each floor; then the live simulator fades in over them.

const FLY_MS = 850;
const STAGGER_MS = 50; // 4F first … 1F last: about 1 s in all
const FADE_MS = 450;

// Each floor's box in the simulator's building image (#scene, 780 × 1068 px),
// as [left, top, width, height]. The simulator only records each floor's top
// plate (FLOOR_POLY: left, back, right and front corners, image x − 345), so
// the boxes are fitted from those: the floor-index drawing's slab corners
// (left and right edges) land on the plate's left and right corners, and its
// depth is scaled so the front corner lands on the plate's front corner.
// The two drawings use slightly different isometric angles, so the fit is
// exact at the plate corners and close elsewhere.
const SIM_FLOOR_BOX = {
  '4F': [17.3, 64.3, 754.1, 303.6],
  '3F': [17.3, 267.7, 754.1, 365.4],
  '2F': [17.3, 499.3, 754.1, 362.7],
  '1F': [17.3, 667.5, 754.1, 399.8],
};
const SIM_IMG = { w: 780, h: 1068 };
// Before the simulator has loaded, its layout is known from its own CSS: the
// 1920 × 1080 stage, scaled to fit and centred, with #scene at (410, 150), 0.86×.
const STAGE = { w: 1920, h: 1080, x: 410, y: 150, k: 0.86 };

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function sceneRect(frame) {
  const live = simSceneRect();
  if (live) return live;
  const f = frame.getBoundingClientRect();
  const s = Math.min(f.width / STAGE.w, f.height / STAGE.h);
  const left = f.left + (f.width - STAGE.w * s) / 2 + STAGE.x * s;
  const top = f.top + (f.height - STAGE.h * s) / 2 + STAGE.y * s;
  return { left, top, width: SIM_IMG.w * STAGE.k * s, height: SIM_IMG.h * STAGE.k * s };
}

function targetRect(scene, [x, y, w, h]) {
  const kx = scene.width / SIM_IMG.w;
  const ky = scene.height / SIM_IMG.h;
  return { left: scene.left + x * kx, top: scene.top + y * ky, width: w * kx, height: h * ky };
}

let running = false;

/**
 * floors: [{ id: '4F', href, rect }], top floor first — each floor drawing's
 * image and its screen rect in the floor index.
 */
export async function assembleIntoSimulator(floors) {
  if (running) return;
  if (reduced()) {
    window.location.hash = 'sim-1';
    return;
  }
  running = true;
  const frame = simFrame();

  const layer = document.createElement('div');
  layer.className = 'sim-assemble';
  layer.setAttribute('aria-hidden', 'true');
  const clones = floors.map((f) => {
    const img = document.createElement('img');
    img.src = f.href;
    img.alt = '';
    Object.assign(img.style, { left: `${f.rect.left}px`, top: `${f.rect.top}px`, width: `${f.rect.width}px`, height: `${f.rect.height}px` });
    layer.append(img);
    return { ...f, img };
  });
  document.body.append(layer);

  // The simulator page goes up underneath, its frame hidden until the floors land.
  frame.style.opacity = '0';
  window.location.hash = 'sim-1';
  await nextFrame();

  try {
    const scene = sceneRect(frame);
    const flights = clones.map((c, i) => {
      const to = targetRect(scene, SIM_FLOOR_BOX[c.id]);
      return c.img.animate(
        [
          { transform: 'none' },
          { transform: `translate(${to.left - c.rect.left}px, ${to.top - c.rect.top}px) scale(${to.width / c.rect.width}, ${to.height / c.rect.height})` },
        ],
        { duration: FLY_MS, delay: i * STAGGER_MS, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }
      ).finished;
    });
    // The floors hold their places until the simulator has loaded.
    await Promise.all([...flights, simReady()]);
    await nextFrame();

    // The simulator's own drawing takes over: it fades in as the floors fade out.
    const fadeIn = frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
    await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' }).finished;
    await fadeIn.finished;
  } finally {
    frame.style.opacity = '';
    frame.getAnimations().forEach((a) => a.cancel());
    layer.remove();
    running = false;
  }
}
