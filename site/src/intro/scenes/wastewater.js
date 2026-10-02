import { format } from 'd3';
import { createScene, addCaveat, addMethodNote } from '../introShell.js';
import { cssVar } from '../../lib/colorTokens.js';
import { createTooltip } from '../../lib/tooltip.js';
import wastewater from '../../../data/intro/wastewater.json';
import poolUrl from '../../../assets/intro/olympic_pool.webp';

// One year of the airport zone's wastewater, as Olympic pools. A tank of water
// sits across the top with a moving, wavy surface (the water-tank reference).
// Pools appear one by one in reading order; each gets a stream poured from the
// tank and fills from the bottom up, its own surface waving as it rises, until
// it shows as a full pool (the Olympic-pool reference). Slow at first, so a
// single pool can be read, then faster and faster.

const count = format(',');
const POOLS = Math.round(wastewater.total_m3_per_year / wastewater.olympic_pool_m3);
const POOL_ASPECT = 2; // 50 m x 25 m
const PITCH_X = 46; // target px per pool column
const GAP = 3;
const TANK_H = 34; // the water tank across the top
const STREAM_GAP = 30; // space between the tank and the first row of pools
const RUN_MS = 18000; // first pool appears at 0, last finishes filling at RUN_MS
const POUR_MS = 260; // stream falls from the tank into a new pool
const FILL_EACH_MS = [1500, 650]; // a pool's fill time: slow for the first, quick by the end
const EASE = 2.6; // >1: pools come slowly at first, then faster
const APPEAR_MS = 220; // a pool fades in before its stream arrives

const liters = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} million` : count(Math.round(n)));

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = url;
  });
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export default {
  id: 3,
  navLabel: 'Wastewater',

  async mount(container) {
    const w = wastewater;
    const { el, body } = createScene({
      index: 3,
      title: 'How much wastewater?',
      summary: `By their own environmental impact assessments, the airport zone's two biggest plants are designed to discharge about ${liters(
        w.total_liters_per_year
      )} liters of wastewater a year: enough to fill about ${count(POOLS)} Olympic swimming pools.`,
    });

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
    const litersEl = counter('Liters of wastewater');
    const poolsEl = counter('Olympic pools filled');

    const legend = document.createElement('ul');
    legend.className = 'legend';
    for (const [cls, label] of [
      ['water-swatch--pool', `1 shape = 1 Olympic pool (${count(w.olympic_pool_m3)} m³)`],
      ['water-swatch--water', 'Wastewater, one year'],
    ]) {
      const li = document.createElement('li');
      li.className = 'legend__item';
      const sw = document.createElement('span');
      sw.className = `water-swatch ${cls}`;
      const l = document.createElement('span');
      l.textContent = label;
      li.append(sw, l);
      legend.append(li);
    }
    body.append(legend);

    const figure = document.createElement('figure');
    figure.className = 'figure water-figure';
    // The counters and the tank stay pinned to the top while the tall grid of
    // pools scrolls under them, so the streams always pour from a visible tank.
    const sticky = document.createElement('div');
    sticky.className = 'water-sticky';
    const tankCanvas = document.createElement('canvas');
    tankCanvas.setAttribute('aria-hidden', 'true');
    sticky.append(counters, tankCanvas);
    figure.append(sticky);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${count(POOLS)} Olympic swimming pools, filled by one year of wastewater, about ${liters(w.total_liters_per_year)} liters`);
    figure.append(canvas);
    body.append(figure);
    const tooltip = createTooltip(figure);

    const end = document.createElement('p');
    end.className = 'prod-end water-end';
    end.textContent = `${count(POOLS)} Olympic pools a year, from two plants.`;
    body.append(end);

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
    body.append(controls);

    addMethodNote(el, 'Sources and math', [
      ...w.plants.map((p) => `${p.name}: about ${liters(p.liters_per_year)} liters a year (${count(p.m3_per_year)} m³, ${p.scope}). Source: ${p.eia}, ${p.url}`),
      `Total ${count(w.total_m3_per_year)} m³ ÷ ${count(w.olympic_pool_m3)} m³ per pool ≈ ${count(POOLS)} pools. ${w.olympic_pool_note}`,
    ]);
    addCaveat(el, w.caveat);
    container.replaceChildren(el);

    const colors = {
      water: cssVar('--color-water'),
      waterLight: cssVar('--color-water-light'),
      waterDeep: cssVar('--color-water-deep'),
      highlight: cssVar('--surface'),
    };
    const poolImg = await loadImage(poolUrl);

    // --- layout: pools in a grid under the tank ------------------------------
    let L = null;
    function layout() {
      const W = figure.clientWidth;
      const cols = Math.max(10, Math.floor(W / PITCH_X));
      const pitchX = W / cols;
      const poolW = pitchX - GAP;
      const poolH = poolW / POOL_ASPECT;
      const pitchY = poolH + GAP;
      const rows = Math.ceil(POOLS / cols);
      const top = STREAM_GAP;
      const H = Math.ceil(top + rows * pitchY + 4);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tankCanvas.width = Math.round(W * dpr);
      tankCanvas.height = Math.round(TANK_H * dpr);
      tankCanvas.style.width = `${W}px`;
      tankCanvas.style.height = `${TANK_H}px`;
      const tctx = tankCanvas.getContext('2d');
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Two sprites at cell size: the full pool, and the same pool drained.
      const sprite = (filter) => {
        const c = document.createElement('canvas');
        c.width = Math.ceil(poolW * dpr);
        c.height = Math.ceil(poolH * dpr);
        const x = c.getContext('2d');
        x.filter = filter;
        x.drawImage(poolImg, 0, 0, c.width, c.height);
        return c;
      };
      const full = sprite('none');
      const empty = sprite('grayscale(1) brightness(1.35) contrast(0.7)');

      // When each pool appears, starts filling and is full: ease-in pacing.
      const ramp = (k) => (k / POOLS) ** (1 / EASE);
      const pools = Array.from({ length: POOLS }, (_, k) => {
        const fillMs = FILL_EACH_MS[0] + (FILL_EACH_MS[1] - FILL_EACH_MS[0]) * ramp(k);
        const start = ramp(k) * (RUN_MS - fillMs - POUR_MS);
        return { x: (k % cols) * pitchX + GAP / 2, y: top + Math.floor(k / cols) * pitchY, start, fillMs, phase: (k * 2.39996) % (Math.PI * 2) };
      });
      L = { W, H, ctx, tctx, cols, rows, pitchX, poolW, poolH, pitchY, top, full, empty, pools };
    }

    // A wavy surface across [x0, x1] at height y, amplitude a, moving with time.
    function wave(ctx, x0, x1, y, a, t, phase, len) {
      ctx.moveTo(x0, y);
      for (let x = x0; x <= x1 + 0.5; x += Math.max(1, (x1 - x0) / 24)) {
        ctx.lineTo(x, y + Math.sin((x - x0) / len * Math.PI * 2 + t / 260 + phase) * a);
      }
    }

    function drawTank(ctx, W, t) {
      ctx.clearRect(0, 0, W, TANK_H);
      ctx.fillStyle = colors.water;
      ctx.beginPath();
      wave(ctx, 0, W, 7, 2.6, t, 0, 90);
      ctx.lineTo(W, TANK_H);
      ctx.lineTo(0, TANK_H);
      ctx.closePath();
      ctx.fill();
      // Lighter crest band, as in the tank reference.
      ctx.fillStyle = colors.waterLight;
      ctx.beginPath();
      wave(ctx, 0, W, 7, 2.6, t, 0, 90);
      for (let x = W; x >= -0.5; x -= W / 24) ctx.lineTo(x, 12 + Math.sin(x / 90 * Math.PI * 2 + t / 260 + 1.4) * 2.2);
      ctx.closePath();
      ctx.fill();
    }

    // `t` is playback progress; waves run on their own clock so they keep
    // moving when paused (and stand still under reduced motion).
    function draw(t) {
      const wt = reduced ? 0 : performance.now();
      const { ctx, W, H, poolW, poolH, full, empty, pools } = L;
      ctx.clearRect(0, 0, W, H);
      let filled = 0;
      const streams = [];
      for (const p of pools) {
        const appear = Math.min(1, (t - p.start + APPEAR_MS) / APPEAR_MS);
        if (appear <= 0) continue;
        const u = Math.min(1, Math.max(0, (t - p.start - POUR_MS) / p.fillMs));
        if (u >= 1) {
          ctx.globalAlpha = 1;
          ctx.drawImage(full, p.x, p.y, poolW, poolH);
          filled++;
          continue;
        }
        ctx.globalAlpha = appear;
        ctx.drawImage(empty, p.x, p.y, poolW, poolH);
        ctx.globalAlpha = 1;
        if (t >= p.start) streams.push({ p, u, pour: Math.min(1, (t - p.start) / POUR_MS) });
        if (u > 0) {
          // Water rises from the bottom with a moving surface; under it, the full pool.
          const level = p.y + poolH * (1 - u);
          ctx.save();
          ctx.beginPath();
          wave(ctx, p.x, p.x + poolW, level, Math.min(1.4, poolH * 0.12), wt, p.phase, poolW * 0.7);
          ctx.lineTo(p.x + poolW, p.y + poolH);
          ctx.lineTo(p.x, p.y + poolH);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(full, p.x, p.y, poolW, poolH);
          ctx.fillStyle = colors.waterLight;
          ctx.globalAlpha = 0.35 * (1 - u);
          ctx.fillRect(p.x, level - 2, poolW, 3);
          ctx.restore();
        }
      }

      // Streams from the (pinned) tank into the pools that are filling right now.
      const tankBottom = Math.max(0, tankCanvas.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top) - 2;
      for (const { p, u, pour } of streams) {
        const x = p.x + poolW / 2;
        const y0 = Math.min(tankBottom, p.y);
        const y1 = y0 + (p.y + poolH * 0.5 - y0) * pour;
        const w = Math.max(1.2, poolW * 0.18) * (1 - u * 0.6);
        ctx.fillStyle = colors.water;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        const wob = (y) => Math.sin(y / 18 + wt / 90 + p.phase) * 0.9;
        ctx.moveTo(x - w / 2 + wob(y0), y0);
        for (let y = y0; y <= y1; y += 6) ctx.lineTo(x - w / 2 + wob(y), y);
        ctx.lineTo(x - w / 2 + wob(y1), y1);
        ctx.arc(x + wob(y1), y1, w / 2, Math.PI, 0, true);
        for (let y = y1; y >= y0; y -= 6) ctx.lineTo(x + w / 2 + wob(y), y);
        ctx.closePath();
        ctx.fill();
        // A bright fleck running down the stream, so it reads as moving.
        const fy = y0 + (((wt / 4 + p.phase * 40) % 60) / 60) * (y1 - y0);
        ctx.fillStyle = colors.highlight;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x - w * 0.15 + wob(fy), fy, Math.max(0.6, w * 0.3), 4);
        ctx.globalAlpha = 1;
      }

      drawTank(L.tctx, W, wt);

      const done = t >= RUN_MS;
      const shownPools = done ? POOLS : filled;
      poolsEl.textContent = count(shownPools);
      litersEl.textContent = done ? liters(w.total_liters_per_year) : liters(shownPools * w.olympic_pool_m3 * 1000);
      end.classList.toggle('is-visible', done);
    }

    // --- playback -------------------------------------------------------------
    const total = RUN_MS;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let elapsed = 0;
    let playing = false;
    let started = false;
    let last = null;
    const sync = () => {
      const done = elapsed >= total;
      playBtn.textContent = playing ? 'Pause' : 'Play';
      playBtn.disabled = done;
      skipBtn.disabled = done;
    };
    // While playing, the page follows the newest pools down, so the filling
    // row stays in view; scrolling by hand hands control back until Replay.
    let follow = true;
    const stopFollow = () => (follow = false);
    for (const ev of ['wheel', 'touchmove', 'keydown']) window.addEventListener(ev, stopFollow, { passive: true });
    function followFront() {
      if (!follow || !L) return;
      const shown = L.pools.findLastIndex((p) => elapsed >= p.start);
      if (shown < 0) return;
      const frontY = canvas.getBoundingClientRect().top + window.scrollY + L.pools[shown].y + L.poolH;
      const target = frontY - window.innerHeight * 0.62;
      if (target > window.scrollY) window.scrollTo(0, window.scrollY + (target - window.scrollY) * 0.12);
    }

    // One animation loop at a time; it idles (waves only) once paused or done.
    let looping = false;
    function frame(now) {
      if (!canvas.isConnected) {
        looping = false;
        return;
      }
      if (playing) {
        elapsed = Math.min(total, elapsed + (last == null ? 0 : now - last));
        if (elapsed >= total) playing = false;
        sync();
        followFront();
      }
      last = now;
      draw(elapsed);
      if (playing || !reduced) requestAnimationFrame(frame);
      else looping = false;
    }
    const kick = () => {
      if (looping) return;
      looping = true;
      requestAnimationFrame(frame);
    };
    const play = () => {
      started = true;
      playing = true;
      last = null;
      sync();
      kick();
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
      elapsed = total;
      draw(elapsed);
      sync();
      kick();
    });
    replayBtn.addEventListener('click', () => {
      elapsed = 0;
      follow = true;
      sticky.scrollIntoView({ block: 'start' });
      play();
    });

    layout();
    new ResizeObserver(() => {
      if (!canvas.isConnected) return;
      layout();
      draw(elapsed);
    }).observe(figure);

    if (reduced) {
      started = true;
      elapsed = total;
      controls.hidden = true;
      draw(elapsed);
    } else {
      draw(0);
      sync();
      kick();
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && !started) {
            io.disconnect();
            play();
          }
        },
        { threshold: 0.6 }
      );
      // The tall grid never gets 30% on screen; start when the tank comes into view.
      io.observe(sticky);
    }

    // Hover a pool: what one pool holds.
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top - L.top;
      const j = Math.floor(x / L.pitchX);
      const i = Math.floor(y / L.pitchY);
      if (y < 0 || j < 0 || j >= L.cols || i >= L.perCol[j]) return tooltip.hide();
      const card = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'tooltip__title';
      title.textContent = `Pool ${count(i * L.cols + j + 1)} of ${count(POOLS)}`;
      const note = document.createElement('p');
      note.className = 'tooltip__note';
      note.textContent = w.olympic_pool_note;
      card.append(title, note);
      tooltip.show(card, { x: j * L.pitchX + L.pitchX / 2, y: canvas.offsetTop + L.top + i * L.pitchY });
    });
    canvas.addEventListener('pointerleave', () => tooltip.hide());
  },
};
