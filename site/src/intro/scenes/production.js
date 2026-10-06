import { easeCubicInOut, scaleLinear, format } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../introShell.js';
import { cssVar } from '../../lib/colorTokens.js';
import { createTooltip } from '../../lib/tooltip.js';
import production from '../../../data/intro/production.json';
import backUrl from '../../../assets/intro/iphone_back.webp';
import sideUrl from '../../../assets/intro/iphone_side.webp';
import fujiUrl from '../../../assets/intro/fuji.webp';

// --- derived values (everything comes from production.json) -------------
const D = (() => {
  const p = production;
  const daySeconds = p.hours_per_day * 3600;
  const perSecond = p.peak_iphones_per_day / daySeconds;
  const thicknessM = p.phone_thickness_mm / 1000;
  const stackM = p.peak_iphones_per_day * thicknessM;
  const fujiM = p.mount_fuji_height_m;
  const phonesToSummit = Math.ceil(fujiM / thicknessM);
  return {
    ...p,
    daySeconds,
    perSecond,
    batch: Math.round(perSecond), // phones shown per second in the fill
    thicknessM,
    stackM,
    fujiM,
    diffM: stackM - fujiM,
    phonesToSummit,
    secondsToSummit: phonesToSummit / perSecond,
  };
})();

const count = format(',');
const fmtClock = (s) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
};
const fmtHeight = (m) => (m < 10 ? `${m.toFixed(2)} m` : `${count(Math.round(m))} m`);
const fmtHM = (s) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
const roundTo = (v, step) => Math.round(v / step) * step;

// --- timeline (seconds of real time) -------------------------------------
const FILL_PHONES = 48; // phones drawn one by one before they stack (an animation length, not data)
const BELOW_CANVAS_PX = 150; // closing line, notes link and the Back / Next buttons under the canvas
const MIN_H = 220; // short laptop windows still fit the whole screen
const PLAY_SPEED = 1.6; // after the real-time phone fill, the stack and zoom play this much faster
const STACK_S = 2.4;
const ZOOM_OUT_S = 5; // geometric camera zoom-out
const RISE_S = 4.5; // camera fixed, stack keeps rising
const SUMMIT_HOLD_S = 1.1; // beat when the stack passes Fuji's summit
const STACK_FRACTION = 0.7; // stack fills this share of the view while zooming

// --- fixed sizes (CSS px) ------------------------------------------------
const PAD = 16;
const PHONE_W = 40;
const CELL_GAP = 14;
const AXIS_X = 66;
const STACK_W_MAX = 96; // stack width scales down on narrow screens (it is not to scale anyway)
const TOP = 30;
const BOTTOM = 52;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = url;
  });
}

// A simple Fuji silhouette in a 1x1 box (y down), used when the photo at true
// height would be too wide for its half of the screen.
const FUJI_BODY = new Path2D(
  'M0 1 C0.2 0.93 0.35 0.6 0.44 0 L0.47 0.035 L0.5 0.012 L0.53 0.035 L0.56 0 C0.65 0.6 0.8 0.93 1 1 Z'
);
const FUJI_SNOW = new Path2D(
  'M0.44 0 L0.47 0.035 L0.5 0.012 L0.53 0.035 L0.56 0 C0.58 0.14 0.6 0.24 0.62 0.32 L0.59 0.28 L0.57 0.36 L0.54 0.27 L0.51 0.38 L0.48 0.26 L0.45 0.35 L0.43 0.27 L0.385 0.33 C0.4 0.25 0.42 0.15 0.44 0 Z'
);

export default {
  id: 2,
  navLabel: 'Production pace',

  async mount(container) {
    const { el, body } = createScene({
      index: 2,
      title: 'How fast are iPhones made here?',
      summary: `At its reported peak, Foxconn Zhengzhou turned out about ${count(D.peak_iphones_per_day)} iPhones a day: about ${D.batch} every second. Stack one day's worth flat and see how high it goes.`,
    });

    const colors = {
      ink: cssVar('--ink'),
      inkSecondary: cssVar('--ink-secondary'),
      inkMuted: cssVar('--ink-muted'),
      grid: cssVar('--grid'),
      iphone: cssVar('--color-iphone'),
      fuji: cssVar('--color-fuji'),
      fujiSnow: cssVar('--color-fuji-snow'),
    };

    const caption = document.createElement('p');
    caption.className = 'prod-caption';
    body.append(caption);

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
    const clockEl = counter('Time elapsed, at peak pace');
    const phonesEl = counter('iPhones made');
    body.append(counters);

    const figure = document.createElement('figure');
    figure.className = 'figure prod-figure';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      `One day's peak output of ${count(D.peak_iphones_per_day)} ${D.phone_model}s, stacked flat, would be about ${fmtHeight(D.stackM)} tall, next to Mount Fuji at ${count(D.fujiM)} m.`
    );
    figure.append(canvas);
    body.append(figure);
    const tooltip = createTooltip(figure);

    // The closing sentence replaces the caption above the chart when the
    // animation ends (the figures themselves are in the stack's hover card).
    const endText = `Stacked flat, one day's peak production of ${D.phone_model}s would rise about ${(D.stackM / 1000).toFixed(1)} km — ${
      D.diffM >= 0 ? 'higher than' : 'short of'
    } Mount Fuji (${count(D.fujiM)} m).`;

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
      `Peak output: ${count(D.peak_iphones_per_day)} iPhones a day (${D.peak_sources.join('; ')}). ${D.hours_note} That is ${count(D.peak_iphones_per_day)} ÷ ${count(D.daySeconds)} s ≈ ${D.perSecond.toFixed(1)} a second.`,
      `Thickness: ${D.phone_thickness_mm} mm (${D.phone_thickness_source}). ${count(D.peak_iphones_per_day)} × ${D.phone_thickness_mm} mm = ${fmtHeight(D.stackM)}.`,
      `Mount Fuji: ${count(D.fujiM)} m. The stack reaches it after ${count(D.phonesToSummit)} phones (${count(D.fujiM)} m ÷ ${D.phone_thickness_mm} mm), about ${fmtHM(D.secondsToSummit)} into the day.`,
    ]);
    addCaveat(el, D.peak_caveat, D.phone_caveat, 'Heights are to scale; widths are not.');

    container.replaceChildren(el);

    const [backImg, sideImg, fujiImg] = await Promise.all([loadImage(backUrl), loadImage(sideUrl), loadImage(fujiUrl)]);
    const phoneH = PHONE_W * (backImg.height / backImg.width);
    // The photo's summit is not its top edge (faint sky above it), so find it:
    // the first row that is clearly opaque, and the rim's span in that row.
    const fujiPeak = (() => {
      const c = document.createElement('canvas');
      c.width = fujiImg.width;
      c.height = fujiImg.height;
      const g = c.getContext('2d');
      g.drawImage(fujiImg, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      for (let y = 0; y < c.height; y++) {
        let l = -1;
        let r = -1;
        for (let x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] > 128) {
            if (l < 0) l = x;
            r = x;
          }
        }
        if (l >= 0) return { top: y / c.height, rimL: l / c.width, rimR: r / c.width };
      }
      return { top: 0, rimL: 0.45, rimR: 0.55 };
    })();
    // Width per metre of summit height (the photo is drawn so its summit sits at 3,776 m).
    const fujiAspect = fujiImg.width / (fujiImg.height * (1 - fujiPeak.top));

    // --- layout: depends on the canvas size; N is fixed once playback starts
    let L = null;
    let started = false;

    function layout() {
      const W = figure.clientWidth;
      // Tall enough for the stack, but short enough that the whole screen
      // (counters, canvas, closing line, notes) fits one window: no scrolling.
      // The caption is tallest with the closing sentence: size it for that now,
      // so the chart never moves when the sentence appears.
      const was = [caption.textContent, caption.className];
      caption.textContent = endText;
      caption.classList.add('is-end');
      caption.style.minHeight = '';
      caption.style.minHeight = `${caption.offsetHeight}px`;
      [caption.textContent, caption.className] = was;
      const canvasTop = canvas.getBoundingClientRect().top + window.scrollY;
      const fitH = window.innerHeight - canvasTop - BELOW_CANVAS_PX;
      const H = Math.round(Math.max(MIN_H, Math.min(640, W * 0.62, fitH)));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The fill shows FILL_PHONES phones, in complete rows: as many columns
      // as fit, rounded down to a divisor of FILL_PHONES so no row is half-filled.
      const cellW = PHONE_W + CELL_GAP;
      const cellH = phoneH + CELL_GAP;
      const fitCols = Math.max(1, Math.floor((W - 2 * PAD) / cellW));
      let cols = Math.min(fitCols, FILL_PHONES);
      while (FILL_PHONES % cols) cols -= 1;
      const n = L && started ? L.n : FILL_PHONES;
      const fillS = L && started ? L.fillS : Math.ceil(n / D.batch);

      const rng = seeded(31);
      const gx0 = (W - cols * cellW) / 2 + cellW / 2;
      const cells = Array.from({ length: n }, (_, i) => ({
        x: gx0 + (i % cols) * cellW + (rng() - 0.5) * 8,
        y: PAD + cellH / 2 + Math.floor(i / cols) * cellH + (rng() - 0.5) * 8,
        rot: (rng() - 0.5) * 0.22,
        appear: Math.floor(i / D.batch),
        delay: (i / n) * 0.9,
      }));

      const y0 = H - BOTTOM;
      const plotH = y0 - TOP;
      const pitch0 = Math.min(7, (plotH * 0.72) / n);
      const c0 = (plotH * D.thicknessM) / pitch0; // meters in view at the start
      const cF = 1.15 * Math.max(D.stackM, D.fujiM);
      const stackW = Math.round(Math.min(STACK_W_MAX, Math.max(40, W * 0.11)));
      const stackX0 = W / 2;
      const stackX1 = AXIS_X + 24 + stackW / 2;
      const fujiArea = [stackX1 + stackW / 2 + Math.min(50, W * 0.06), W - PAD];
      const fujiHF = (D.fujiM * plotH) / cF;
      const fujiWF = Math.min(fujiHF * fujiAspect, fujiArea[1] - fujiArea[0]);
      const usePhoto = fujiHF * fujiAspect <= fujiArea[1] - fujiArea[0];

      return { W, H, ctx, stackW, cells, n, fillS, y0, plotH, pitch0, c0, cF, stackX0, stackX1, fujiArea, fujiAspectDrawn: fujiWF / fujiHF, usePhoto };
    }

    // Stack height (m) as a function of zoom progress τ ∈ [0, ZOOM_OUT_S + RISE_S].
    function stackAt(tau) {
      const s0 = L.n * D.thicknessM;
      if (tau <= ZOOM_OUT_S) {
        const u = tau / ZOOM_OUT_S;
        const camera = L.c0 * (L.cF / L.c0) ** u;
        const f = lerp(s0 / L.c0, STACK_FRACTION, u);
        return { camera, stack: Math.max(s0, f * camera), u };
      }
      const s1 = STACK_FRACTION * L.cF;
      const v = clamp01((tau - ZOOM_OUT_S) / RISE_S);
      return { camera: L.cF, stack: lerp(s1, D.stackM, v), u: 1 };
    }

    // τ at which the stack reaches Fuji's summit (monotonic, so bisect).
    function summitTau() {
      let lo = 0;
      let hi = ZOOM_OUT_S + RISE_S;
      if (stackAt(hi).stack < D.fujiM) return null;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (stackAt(mid).stack < D.fujiM) lo = mid;
        else hi = mid;
      }
      return hi;
    }

    let tauSummit = null;
    const zoomStart = () => L.fillS + STACK_S;
    const total = () => zoomStart() + ZOOM_OUT_S + RISE_S + (tauSummit == null ? 0 : SUMMIT_HOLD_S) + 0.2;
    const tauAt = (t) => {
      const z = t - zoomStart();
      if (tauSummit == null || z <= tauSummit) return z;
      if (z <= tauSummit + SUMMIT_HOLD_S) return tauSummit;
      return z - SUMMIT_HOLD_S;
    };

    // --- drawing --------------------------------------------------------
    let stackRect = null; // CSS px, for hover
    let current = { phones: 0, height: 0 };

    function drawAxis(ctx, y, alpha) {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colors.grid;
      ctx.fillStyle = colors.inkMuted;
      ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const fmt = y.tickFormat(5);
      for (const v of y.ticks(5)) {
        const py = y(v);
        if (py < TOP - 2) continue;
        ctx.beginPath();
        ctx.moveTo(AXIS_X, py);
        ctx.lineTo(L.W - PAD, py);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText(`${fmt(v)} m`, AXIS_X - 8, py);
      }
      ctx.restore();
    }

    function drawStack(ctx, x, stackM, ppm) {
      const pitch = D.thicknessM * ppm;
      const h = stackM * ppm;
      const left = x - L.stackW / 2;
      const top = L.y0 - h;
      const spriteAlpha = clamp01((pitch - 2) / 2);
      if (spriteAlpha < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - spriteAlpha;
        ctx.fillStyle = colors.iphone;
        ctx.fillRect(left, top, L.stackW, h);
        ctx.globalAlpha = (1 - spriteAlpha) * 0.18;
        ctx.fillStyle = '#000';
        for (let yy = L.y0 - 3; yy > top; yy -= 3) ctx.fillRect(left, yy, L.stackW, 1);
        ctx.restore();
      }
      if (spriteAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = spriteAlpha;
        const n = Math.ceil(stackM / D.thicknessM);
        for (let i = 0; i < n; i++) ctx.drawImage(sideImg, left, L.y0 - (i + 1) * pitch, L.stackW, pitch);
        ctx.restore();
      }
      stackRect = { x: left, y: top, w: L.stackW, h: Math.max(h, 6) };
    }

    function drawFuji(ctx, ppm, alpha) {
      if (alpha <= 0) return;
      const h = D.fujiM * ppm;
      const w = h * (L.usePhoto ? fujiAspect : L.fujiAspectDrawn);
      const cx = (L.fujiArea[0] + L.fujiArea[1]) / 2;
      const x = Math.max(L.fujiArea[0], cx - w / 2);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (L.usePhoto) {
        const imgH = h / (1 - fujiPeak.top); // the sky above the summit rises past 3,776 m
        ctx.drawImage(fujiImg, x, L.y0 - imgH, w, imgH);
      } else {
        ctx.translate(x, L.y0 - h);
        ctx.scale(w, h);
        ctx.fillStyle = colors.fuji;
        ctx.fill(FUJI_BODY);
        ctx.fillStyle = colors.fujiSnow;
        ctx.fill(FUJI_SNOW);
      }
      ctx.restore();
      // The rim's right end (the silhouette's crater spans 0.44–0.56 of its width).
      return { cx: x + w / 2, rimRight: x + w * (L.usePhoto ? fujiPeak.rimR : 0.56) };
    }

    function label(ctx, text, x, y, { color = colors.inkSecondary, size = 12, align = 'center', mono = false, weight = 400 } = {}) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${mono ? '"IBM Plex Mono", ui-monospace, monospace' : 'Inter, system-ui, sans-serif'}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    function draw(t) {
      const { ctx, W, H, y0, plotH } = L;
      ctx.clearRect(0, 0, W, H);
      stackRect = null;
      const zt = t - zoomStart();

      if (t < L.fillS + STACK_S) {
        // FILL, then STACK: each phone moves from its cell to a slot in one pile.
        const shown = Math.min(L.n, D.batch * Math.min(L.fillS, Math.floor(t) + 1));
        for (let i = 0; i < shown; i++) {
          const c = L.cells[i];
          const pop = clamp01((t - c.appear) / 0.25);
          const e = easeCubicInOut(clamp01((t - L.fillS - c.delay) / 1.2));
          const x = lerp(c.x, L.stackX0, e);
          const y = lerp(c.y, y0 - (i + 0.5) * L.pitch0, e);
          const w = lerp(PHONE_W, L.stackW, e) * lerp(0.6, 1, pop);
          const h = lerp(phoneH, L.pitch0, e) * lerp(0.6, 1, pop);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(c.rot * (1 - e));
          ctx.globalAlpha = pop * (1 - e);
          ctx.drawImage(backImg, -w / 2, -h / 2, w, h);
          ctx.globalAlpha = pop * e;
          ctx.drawImage(sideImg, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        if (t >= L.fillS) stackRect = { x: L.stackX0 - L.stackW / 2, y: y0 - L.n * L.pitch0, w: L.stackW, h: L.n * L.pitch0 };
        current = { phones: shown, height: shown * D.thicknessM, seconds: Math.min(t, L.fillS) };
        caption.textContent =
          t < L.fillS
            ? `About ${D.batch} iPhones a second at peak.`
            : 'Lay them flat and stack them.';
      } else {
        // ZOOM: one linear height scale, zooming out as the stack rises.
        const { camera, stack, u } = stackAt(tauAt(t));
        const y = scaleLinear().domain([0, camera]).range([y0, y0 - plotH]);
        const ppm = plotH / camera;
        drawAxis(ctx, y, clamp01(zt / 0.6));
        // Fuji fades in while still taller than the view, so it rises into frame as the camera pulls back.
        const fujiAlpha = clamp01((camera - D.fujiM * 0.45) / (D.fujiM * 0.4));
        const fuji = drawFuji(ctx, ppm, fujiAlpha);
        const x = lerp(L.stackX0, L.stackX1, easeCubicInOut(clamp01(u / 0.3)));
        drawStack(ctx, x, stack, ppm);

        ctx.strokeStyle = colors.inkSecondary;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(AXIS_X, y0 + 0.5);
        ctx.lineTo(W - PAD, y0 + 0.5);
        ctx.stroke();

        label(ctx, 'iPhone stack', x, y0 + 20, { color: colors.ink, weight: 600 });
        if (fuji && fujiAlpha > 0.2) label(ctx, `Mount Fuji · ${count(D.fujiM)} m`, fuji.cx, y0 + 20, { color: colors.ink, weight: 600 });

        // Crossing beat: Fuji's summit line once the stack has passed it.
        if (stack >= D.fujiM) {
          const py = y(D.fujiM);
          const a = tauSummit == null ? 1 : clamp01((zt - tauSummit) / 0.3);
          ctx.save();
          ctx.globalAlpha = a;
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = colors.ink;
          ctx.beginPath();
          ctx.moveTo(AXIS_X, py);
          ctx.lineTo(fuji ? fuji.rimRight : W - PAD, py);
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = a;
          label(
            ctx,
            W < 640
              ? `Fuji's summit: ${fmtHM(D.secondsToSummit)}`
              : `Passes Fuji's summit after ${fmtHM(D.secondsToSummit)}, at about ${count(roundTo(D.phonesToSummit, 500))} iPhones`,
            x + L.stackW / 2 + 10,
            py - 8,
            { color: colors.ink, align: 'left', size: 12 }
          );
          ctx.globalAlpha = 1;
        }

        const seconds = Math.max(L.fillS, (stack / D.thicknessM) / D.perSecond);
        current = { phones: Math.max(L.n, Math.round(stack / D.thicknessM)), height: stack, seconds };
        caption.textContent = `…and keep going for ${D.hours_per_day} hours.`;
        caption.classList.remove('is-end');
      }

      clockEl.textContent = fmtClock(current.seconds);
      phonesEl.textContent = count(current.phones);
      const done = t >= total() - 0.01;
      if (done) {
        caption.textContent = endText;
        caption.classList.add('is-end');
        clockEl.textContent = fmtClock(D.daySeconds);
        phonesEl.textContent = count(D.peak_iphones_per_day);
        current = { phones: D.peak_iphones_per_day, height: D.stackM, seconds: D.daySeconds };
      }
    }

    // --- playback -------------------------------------------------------
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let elapsed = 0;
    let playing = false;
    let last = null;

    function syncButtons() {
      const done = elapsed >= total();
      playBtn.textContent = playing ? 'Pause' : 'Play';
      playBtn.disabled = done;
      skipBtn.disabled = done;
    }

    function frame(now) {
      if (!canvas.isConnected) return; // scene was replaced
      if (playing) {
        const before = elapsed;
        // The phone fill runs in real time (about 6 a second, literally); only the
        // stacking and zoom after it play faster.
        const dt = last == null ? 0 : (now - last) / 1000;
        elapsed = Math.min(total(), elapsed + (elapsed < L.fillS ? dt : dt * PLAY_SPEED));
        if (elapsed >= total()) playing = false;
        syncButtons();
      }
      last = now;
      draw(elapsed);
      if (playing) requestAnimationFrame(frame);
    }

    function play() {
      started = true;
      playing = true;
      last = null;
      syncButtons();
      requestAnimationFrame(frame);
    }

    playBtn.addEventListener('click', () => {
      if (playing) {
        playing = false;
        syncButtons();
      } else play();
    });
    skipBtn.addEventListener('click', () => {
      started = true;
      playing = false;
      elapsed = total();
      draw(elapsed);
      syncButtons();
    });
    replayBtn.addEventListener('click', () => {
      elapsed = 0;
      play();
    });

    L = layout();
    tauSummit = summitTau();
    new ResizeObserver(() => {
      if (!canvas.isConnected) return;
      L = layout();
      tauSummit = summitTau();
      draw(elapsed);
    }).observe(figure);

    if (reduced) {
      // Static end state, no animation and no playback controls.
      started = true;
      elapsed = total();
      controls.hidden = true;
      draw(elapsed);
    } else {
      draw(0);
      syncButtons();
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

    // Hover / tap on the stack shows the math.
    const showMath = (event) => {
      const r = canvas.getBoundingClientRect();
      const px = event.clientX - r.left;
      const py = event.clientY - r.top;
      const s = stackRect;
      if (!s || px < s.x || px > s.x + s.w || py < s.y || py > s.y + s.h) return tooltip.hide();
      const card = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'tooltip__title';
      title.textContent = `${D.phone_model} stack`;
      const dl = document.createElement('dl');
      const rows = [
        ['Phones', count(current.phones)],
        ['Height', fmtHeight(current.phones * D.thicknessM)],
        ['Fuji', `${count(D.fujiM)} m`],
      ];
      const diff = current.phones * D.thicknessM - D.fujiM;
      if (current.phones * D.thicknessM >= D.fujiM)
        rows.push(['Higher by', `about ${count(roundTo(Math.abs(diff), 10))} m`]);
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        dl.append(dt, dd);
      }
      const note = document.createElement('p');
      note.className = 'tooltip__note';
      note.textContent = `${count(current.phones)} × ${D.phone_thickness_mm} mm`;
      card.append(title, dl, note);
      tooltip.show(card, { x: s.x + s.w / 2, y: Math.max(s.y, py - 10) });
    };
    canvas.addEventListener('pointermove', showMath);
    canvas.addEventListener('pointerdown', showMath);
    canvas.addEventListener('pointerleave', () => tooltip.hide());
  },
};
