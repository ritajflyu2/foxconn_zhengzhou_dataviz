import { easeCubicInOut } from 'd3';
import { seededRandom, lerp, bezier, toScreen, createOverlay, snapshot, scrollToScene } from './common.js';
import { raw } from '../lib/dataLoader.js';
import { createPostWords } from './postWords.js';

// Transition 3 → 4: the recruitment-post colors that match Scene 4's worker
// types are pulled out of the posts chart into one cluster per type (the rest
// of Scene 3 dims; types with no Scene 4 row fade away). Each cluster is
// labelled with that worker type's name and contract from scene4_pay_model.json,
// so the viewer reads what each color means. Then Scene 4 fades in and every
// cluster drops into its row's legend dot, its label settling onto the row name.
//
// In between, a word cloud of the most-used words in all the hiring posts
// (scene4_post_words.json) fills the screen below the clusters, each word in
// the colour of the worker type whose posts use it most. The transition holds
// there until the viewer moves on with the next arrow in the bottom bar (or the
// → key): sceneManager hands that press to `next()` instead of skipping ahead.
// Reduced motion: no movement — the clusters, labels and words appear in place,
// and the next arrow goes straight to Scene 4.

const DIM_MS = 500;
const DIM_TO = 0.12; // Scene 3 stays faintly visible while the clusters are read
const GATHER_MS = [700, 950];
const GATHER_SPREAD_MS = 220;
const LABEL_IN_AT = 550;
const LABEL_IN_MS = 400;
const HOLD_UNTIL_MS = 2500; // when the clusters drop if there is no words layer
const WORDS_AT_MS = 1300; // words appear once the clusters have formed
const WORDS_BOTTOM_PX = 100; // keep clear of the fixed arrow bar
const DESCEND_MS = [950, 1150];
const ROW_STAGGER_MS = 110;
const SCENE_IN_MS = 500;
const CLUSTER_MAX_R = 46;
const CLUSTER_MIN_R = 14;
const CLUSTER_Y = 0.38; // cluster row, as a fraction of the window height (no words layer)
const CLUSTER_Y_WORDS = 0.16; // higher when the words fill the space below
const SPIN = 0.00035; // slow turn of each cluster while it is being read (rad/ms)
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function postDots(sceneEl) {
  const svg = sceneEl.querySelector('.posts-figure svg');
  const out = [];
  if (!svg) return out;
  // Every year's bars, revealed or not: leaving Scene 3 mid-playback must not
  // leave the clusters for types that only appear in later years empty.
  for (const seg of svg.querySelectorAll('.yeardots .bar-segment[data-kind]')) {
    for (const c of seg.querySelectorAll('circle')) {
      const p = toScreen(svg, Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
      out.push({ kind: seg.dataset.kind, color: c.getAttribute('fill'), x: p.x, y: p.y, r: Number(c.getAttribute('r')) * p.scale });
    }
  }
  return out;
}

function clusterLabel(worker) {
  const el = document.createElement('div');
  el.className = 'transition-label';
  const name = document.createElement('p');
  name.className = 'transition-label__name';
  name.textContent = worker.label;
  const meaning = document.createElement('p');
  meaning.className = 'transition-label__meaning';
  meaning.textContent = worker.contract;
  el.append(name, meaning);
  return el;
}

function draw(ctx, dots) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const d of dots) {
    if (d.a <= 0.01) continue;
    ctx.globalAlpha = d.a;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function postsToLegend({ root, toData, mountNext, reduced = false }) {
  let skipped = false;
  let overlay = null;
  let committed = false;
  let rowDots = [];
  const anims = [];
  const skip = () => {
    skipped = true;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') skip();
  };
  // Set while the word cloud holds; the next arrow calls it to move on.
  let advance = null;

  const run = async () => {
    const fromEl = root.querySelector('.scene');
    const workers = Object.values(toData.workers);
    const kinds = workers.map((w) => w.color_key);
    const sources = postDots(fromEl);
    const rng = seededRandom(31);

    fromEl.querySelectorAll('.posts-figure .yeardots').forEach((g) => g.style.setProperty('visibility', 'hidden'));
    overlay = createOverlay(skip);
    document.addEventListener('keydown', onKey);
    const ghost = snapshot(fromEl);
    overlay.wrap.prepend(ghost);
    // The still stays opaque (it hides the live page behind it, header included);
    // a sand veil over it does the dimming.
    const veil = document.createElement('div');
    veil.className = 'transition-veil';
    ghost.after(veil);
    const wordsData = raw.scene4_post_words;
    // Deeper while the word cloud is up, so Scene 3's charts don't read through it.
    const veilTo = 1 - (wordsData ? DIM_TO / 2.5 : DIM_TO);
    anims.push(veil.animate([{ opacity: 0 }, { opacity: veilTo }], { duration: reduced ? 0 : DIM_MS, easing: 'ease-out', fill: 'forwards' }));

    const clusterY = window.innerHeight * (wordsData ? CLUSTER_Y_WORDS : CLUSTER_Y);

    // One cluster per Scene 4 worker type, in Scene 4's row order, across a
    // column centred in the window (a transition screen, so not offset for the
    // floor index the way the scenes are).
    const colW = Math.min(1088, window.innerWidth - 64);
    const content = { left: (window.innerWidth - colW) / 2, width: colW };
    const counts = kinds.map((k) => sources.filter((s) => s.kind === k).length);
    const maxCount = Math.max(1, ...counts);
    const clusters = workers.map((w, i) => {
      const n = counts[i];
      const r = Math.max(CLUSTER_MIN_R, CLUSTER_MAX_R * Math.sqrt(n / maxCount));
      const label = clusterLabel(w);
      overlay.wrap.append(label);
      return {
        kind: w.color_key,
        cx: content.left + (content.width * (i + 0.5)) / workers.length,
        cy: Math.max(CLUSTER_MAX_R + 24, clusterY),
        r,
        n,
        label,
      };
    });
    for (const c of clusters) {
      Object.assign(c.label.style, { left: `${c.cx}px`, top: `${c.cy + CLUSTER_MAX_R + 14}px` });
      c.labelIn = c.label.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], {
        duration: reduced ? 0 : LABEL_IN_MS,
        delay: reduced ? 0 : LABEL_IN_AT,
        easing: 'ease-out',
        fill: 'both',
      });
    }

    // Each dot gets a slot on its cluster's sunflower spiral; types with no row fade out.
    const dots = [];
    for (const c of clusters) {
      const mine = sources.filter((s) => s.kind === c.kind);
      const dotR = mine[0]?.r ?? 2;
      mine.forEach((s, k) => {
        const f = (k + 0.5) / mine.length;
        dots.push({
          cluster: c,
          from: s,
          color: s.color,
          slotR: c.r * Math.sqrt(f),
          slotA: k * GOLDEN,
          r: dotR,
          x: s.x,
          y: s.y,
          a: 1,
          delay: reduced ? 0 : rng() * GATHER_SPREAD_MS,
          dur: reduced ? 1 : lerp(GATHER_MS[0], GATHER_MS[1], rng()),
          bow: (rng() - 0.5) * 120,
        });
      });
    }
    for (const s of sources.filter((s) => !kinds.includes(s.kind))) {
      dots.push({ cluster: null, from: s, color: s.color, r: s.r, x: s.x, y: s.y, a: 1, drift: rng() * 40 });
    }

    const slot = (d, t) => {
      const a = d.slotA + t * SPIN;
      return { x: d.cluster.cx + Math.cos(a) * d.slotR, y: d.cluster.cy + Math.sin(a) * d.slotR };
    };

    // The words layer, laid out below the clusters' labels down to the arrow bar.
    let continued = false;
    let words = null;
    if (wordsData) {
      const labelBottom = Math.max(...clusters.map((c) => c.label.getBoundingClientRect().bottom));
      const top = labelBottom + 18;
      const box = { left: content.left + 32, top, width: content.width - 64, height: window.innerHeight - WORDS_BOTTOM_PX - top };
      // Laid out while the clusters form; shown once both are ready.
      createPostWords(overlay.wrap, wordsData, box)
        .then((w) => {
          words = w;
          advance = async () => {
            advance = null;
            if (reduced) return skip();
            await words.hide();
            continued = true;
          };
        })
        .catch((err) => {
          console.error('Words layer failed; continuing without it.', err);
          continued = true;
        });
    }
    let wordsShown = false;

    let descend = null; // set when Scene 4 is on the page
    const t0 = performance.now();

    const startDescend = async (t) => {
      const ok = await mountNext((sceneEl) => {
        sceneEl.style.animation = 'none';
        anims.push(sceneEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SCENE_IN_MS, easing: 'ease-out', fill: 'backwards' }));
        scrollToScene(root);
      });
      committed = true;
      if (!ok) return skip();
      anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SCENE_IN_MS, easing: 'ease-in', fill: 'forwards' }));
      anims.push(veil.animate([{ opacity: veilTo }, { opacity: 0 }], { duration: SCENE_IN_MS, easing: 'ease-in', fill: 'forwards' }));

      rowDots = [...root.querySelectorAll('.pay-row__dot[data-kind]')];
      for (const el of rowDots) el.style.visibility = 'hidden';
      const pageTarget = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 + window.scrollY, r: r.width / 2 };
      };
      const targets = Object.fromEntries(
        rowDots.map((el) => [el.dataset.kind, { dot: el, ...pageTarget(el), name: el.parentElement.querySelector('.pay-row__name') }])
      );

      // Follow the clusters down only as far as the last row needs.
      const lowest = Math.max(...Object.values(targets).map((g) => g.y));
      const scroll0 = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const scroll1 = Math.min(maxScroll, Math.max(scroll0, lowest + 70 - window.innerHeight));

      descend = { start: t, scroll0, scroll1, targets, total: 0 };
      clusters.forEach((c, i) => {
        c.target = targets[c.kind];
        c.start = t + i * ROW_STAGGER_MS;
        c.dur = lerp(DESCEND_MS[0], DESCEND_MS[1], rng());
        descend.total = Math.max(descend.total, c.start - t + c.dur);
      });
    };

    let descending = null; // the mount promise, once the drop has begun
    await new Promise((resolve) => {
      const step = (now) => {
        if (skipped) return resolve();
        const t = now - t0;

        if (words && !wordsShown && (reduced || t >= WORDS_AT_MS)) {
          wordsShown = true;
          words.show(reduced);
        }
        // Hold on the words until the next arrow; without them, drop after a short read.
        if (!descending && (continued || (!wordsData && t >= HOLD_UNTIL_MS))) descending = startDescend(t);

        if (descend) {
          const k = easeCubicInOut(Math.min(1, (t - descend.start) / descend.total));
          window.scrollTo(0, lerp(descend.scroll0, descend.scroll1, k));
        }

        let finished = !!descend;
        for (const d of dots) {
          if (!d.cluster) {
            const u = Math.min(1, t / 500);
            d.a = 1 - u;
            d.y = d.from.y + d.drift * u;
            continue;
          }
          const c = d.cluster;
          const home = slot(d, t);
          if (!descend || !c.target || t < c.start) {
            const u = easeCubicInOut(Math.min(1, Math.max(0, (t - d.delay) / d.dur)));
            const p = bezier(
              {
                p0: d.from,
                p1: { x: d.from.x + d.bow, y: d.from.y - 40 },
                p2: { x: home.x - d.bow * 0.5, y: home.y + 40 },
                p3: home,
              },
              u
            );
            d.x = p.x;
            d.y = p.y;
            if (descend && c.target) finished = false;
            continue;
          }
          // Drop into the row's legend dot: the whole cluster condenses to it.
          d.descendFrom ??= { x: d.x, y: d.y, r: d.r };
          const s = Math.min(1, (t - c.start) / c.dur);
          if (s < 1) finished = false;
          const u = easeCubicInOut(s);
          const tx = c.target.x;
          const ty = c.target.y - window.scrollY;
          const p = bezier(
            {
              p0: d.descendFrom,
              p1: { x: d.descendFrom.x, y: d.descendFrom.y - 30 },
              p2: { x: tx, y: ty - 80 },
              p3: { x: tx, y: ty },
            },
            u
          );
          d.x = p.x;
          d.y = p.y;
          d.r = lerp(d.descendFrom.r, c.target.r, u);
          if (s >= 1 && c.target.dot.style.visibility === 'hidden') c.target.dot.style.visibility = '';
        }

        // Labels ride down with their cluster and settle onto the row name.
        if (descend) {
          for (const c of clusters) {
            if (!c.target?.name || t < c.start) continue;
            // The fade-in's held end state would override the opacity set below.
            c.labelIn?.cancel();
            c.labelIn = null;
            const s = Math.min(1, (t - c.start) / c.dur);
            const u = easeCubicInOut(s);
            const nr = c.target.name.getBoundingClientRect();
            const x0 = c.cx;
            const y0 = c.cy + CLUSTER_MAX_R + 14;
            const x1 = nr.left + c.label.offsetWidth / 2;
            const y1 = nr.top;
            c.label.style.left = `${lerp(x0, x1, u)}px`;
            c.label.style.top = `${lerp(y0, y1, u)}px`;
            // Gone before it reaches the real row name, so the two never read double.
            c.label.style.opacity = String(1 - Math.min(1, Math.max(0, (u - 0.2) / 0.4)));
          }
        }

        draw(overlay.ctx, dots.filter((d) => !d.cluster?.target || t < d.cluster.start + d.cluster.dur));
        if (finished) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    // Skipped before the drop began: Scene 4 still has to go on the page.
    if (descending) await descending;
    else {
      committed = true;
      await mountNext();
    }
  };

  const done = run()
    .catch((err) => {
      console.error('Transition 3 → 4 failed; showing Scene 4 directly.', err);
      return committed ? undefined : mountNext();
    })
    .finally(() => {
      document.removeEventListener('keydown', onKey);
      for (const a of anims) a.finish();
      overlay?.wrap.remove();
      for (const el of rowDots) el.style.visibility = '';
    });

  // The next arrow: moves on from the word cloud once it holds; before that,
  // or once the drop is under way, it skips to Scene 4 (never past it).
  const next = () => {
    if (advance) advance();
    else skip();
    return true;
  };

  return { done, finish: skip, next };
}

postsToLegend.hasReducedMotion = true;
