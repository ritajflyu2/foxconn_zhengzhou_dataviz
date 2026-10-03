import { easeCubicInOut, interpolateRgb } from 'd3';
import { colorFor } from '../lib/colorTokens.js';
import { seededRandom, lerp, bezier, toScreen, createOverlay, snapshot, scrollToScene } from './common.js';
import { raw } from '../lib/dataLoader.js';
import { createPostWords } from './postWords.js';

// Transition 3 → 4: the recruitment-post groups that match Scene 4's worker
// types rise out of the posts chart into one cluster each — direct hire
// (blue), dispatch (orange), student (green); the rest of Scene 3 dims and the
// "not stated" posts rise too, as a grey cluster that stays behind (it has no
// pay row) and fades when Scene 4 comes in. Each cluster is labelled (worker type and
// contract from scene4_pay_model.json; the dispatch cluster with its post group
// name and the two dispatch types), so the viewer reads what each color means.
// Then Scene 4 fades in: the orange cluster splits in two, each half turning to
// its own shade (rebate-type, hourly-type), and every cluster drops into its
// row's legend dot, single-row labels settling onto the row name.
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
const CLUSTER_MAX_R_WORDS = 36; // smaller when the words need the room below
const CLUSTER_MIN_R = 14;
const CLUSTER_Y = 0.38; // cluster row, as a fraction of the window height (no words layer)
const CLUSTER_Y_WORDS = 0.12; // higher when the words fill the space below
const SPIN = 0.00035; // slow turn of each cluster while it is being read (rad/ms)
const SPLIT_MS = 650; // the dispatch cluster parts into its two shades before dropping
const SPLIT_GAP = 1.05; // how far apart the two halves sit, in cluster radii (each side)
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

function clusterLabel(title, text) {
  const el = document.createElement('div');
  el.className = 'transition-label';
  const name = document.createElement('p');
  name.className = 'transition-label__name';
  name.textContent = title;
  const meaning = document.createElement('p');
  meaning.className = 'transition-label__meaning';
  meaning.textContent = text;
  el.append(name, meaning);
  return el;
}

// Scene 3's post group for a Scene 4 worker type: both dispatch types come
// from the one dispatch group.
const groupOf = (colorKey) => (colorKey.endsWith('_dispatch') ? 'dispatch' : colorKey);

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
    // One cluster per post group, in Scene 4's row order; each lists its rows.
    const groups = [];
    for (const w of workers) {
      const key = groupOf(w.color_key);
      let g = groups.find((d) => d.kind === key);
      if (!g) groups.push((g = { kind: key, workers: [] }));
      g.workers.push(w);
    }
    const postGroups = raw.scene3_posts_by_year?.categories ?? [];
    const groupLabel = Object.fromEntries(postGroups.map((c) => [c.key, c.label]));
    // Post groups with no pay row (not stated) get a cluster too; it stays behind.
    for (const c of postGroups) if (!groups.some((g) => g.kind === c.key)) groups.push({ kind: c.key, workers: [] });
    const kinds = groups.map((g) => g.kind);
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
    const maxR = wordsData ? CLUSTER_MAX_R_WORDS : CLUSTER_MAX_R;

    // One cluster per Scene 4 worker type, in Scene 4's row order, across a
    // column centred in the window (a transition screen, so not offset for the
    // floor index the way the scenes are).
    const colW = Math.min(1088, window.innerWidth - 64);
    const content = { left: (window.innerWidth - colW) / 2, width: colW };
    const counts = kinds.map((k) => sources.filter((s) => s.kind === k).length);
    const maxCount = Math.max(1, ...counts);
    const clusters = groups.map((g, i) => {
      const n = counts[i];
      const r = Math.max(CLUSTER_MIN_R, maxR * Math.sqrt(n / maxCount));
      const [w] = g.workers;
      const label =
        g.workers.length === 1
          ? clusterLabel(w.label, w.contract)
          : g.workers.length === 0
            ? clusterLabel(groupLabel[g.kind] ?? g.kind, 'The post names no worker type')
            : clusterLabel(groupLabel[g.kind] ?? g.kind, g.workers.map((d) => d.label).join(' or '));
      overlay.wrap.append(label);
      return {
        kind: g.kind,
        rows: g.workers.map((d) => d.color_key),
        cx: content.left + (content.width * (i + 0.5)) / groups.length,
        cy: Math.max(maxR + 24, clusterY),
        r,
        n,
        label,
      };
    });
    for (const c of clusters) {
      Object.assign(c.label.style, { left: `${c.cx}px`, top: `${c.cy + maxR + 14}px` });
      c.labelIn = c.label.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], {
        duration: reduced ? 0 : LABEL_IN_MS,
        delay: reduced ? 0 : LABEL_IN_AT,
        easing: 'ease-out',
        fill: 'both',
      });
    }

    // Each dot gets a slot on its cluster's sunflower spiral, and a Scene 4 row
    // (the dispatch cluster's dots alternate between its two rows); groups with
    // no row fade out.
    const dots = [];
    for (const c of clusters) {
      const mine = sources.filter((s) => s.kind === c.kind);
      const dotR = mine[0]?.r ?? 2;
      mine.forEach((s, k) => {
        const f = (k + 0.5) / mine.length;
        const row = c.rows.length ? c.rows[k % c.rows.length] : null;
        dots.push({
          cluster: c,
          from: s,
          color: s.color,
          fromColor: s.color,
          row,
          rowColor: row ? colorFor(row) : s.color,
          side: c.rows.length > 1 ? (c.rows.indexOf(row) === 0 ? -1 : 1) : 0,
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
      const box = { left: content.left, top, width: content.width, height: window.innerHeight - WORDS_BOTTOM_PX - top };
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
        c.target = targets[c.rows[0]];
        c.split = c.rows.length > 1;
        // A split cluster parts into its shades first, then drops.
        c.start = t + i * ROW_STAGGER_MS + (c.split ? SPLIT_MS : 0);
        c.dur = lerp(DESCEND_MS[0], DESCEND_MS[1], rng());
        descend.total = Math.max(descend.total, c.start - t + c.dur);
      });
      for (const d of dots) if (d.cluster) d.target = targets[d.row];
    };

    // How far the split has gone (0 → 1) for a split cluster once the drop begins.
    const splitAt = (c, t) => (descend && c.split ? easeCubicInOut(Math.min(1, Math.max(0, (t - descend.start) / SPLIT_MS))) : 0);

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
          // The dispatch cluster parting: each half slides to its side, a
          // little tighter, and turns to its own row's shade.
          const sp = splitAt(c, t);
          if (sp > 0) {
            home.x += d.side * SPLIT_GAP * c.r * sp + (c.cx - home.x) * 0.3 * sp;
            home.y += (c.cy - home.y) * 0.3 * sp;
            d.color = interpolateRgb(d.fromColor, d.rowColor)(sp);
          }
          // A cluster with no pay row stays where it is and fades with Scene 3.
          if (descend && !c.rows.length) d.a = 1 - Math.min(1, (t - descend.start) / SCENE_IN_MS);
          if (!descend || !d.target || t < c.start) {
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
            if (descend && d.target) finished = false;
            continue;
          }
          // Drop into the row's legend dot: the whole cluster condenses to it.
          d.descendFrom ??= { x: d.x, y: d.y, r: d.r };
          const s = Math.min(1, (t - c.start) / c.dur);
          if (s < 1) finished = false;
          const u = easeCubicInOut(s);
          const tx = d.target.x;
          const ty = d.target.y - window.scrollY;
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
          d.r = lerp(d.descendFrom.r, d.target.r, u);
          d.color = interpolateRgb(d.color, d.rowColor)(u);
          if (s >= 1 && d.target.dot.style.visibility === 'hidden') d.target.dot.style.visibility = '';
        }

        // Labels ride down with their cluster and settle onto the row name; a
        // split cluster's label fades as it parts (its rows have their own names).
        if (descend) {
          for (const c of clusters) {
            if (!c.rows.length) {
              c.labelIn?.cancel();
              c.labelIn = null;
              c.label.style.opacity = String(1 - Math.min(1, (t - descend.start) / SCENE_IN_MS));
              continue;
            }
            if (c.split) {
              const sp = splitAt(c, t);
              if (sp > 0) {
                c.labelIn?.cancel();
                c.labelIn = null;
                c.label.style.opacity = String(1 - sp);
              }
              continue;
            }
            if (!c.target?.name || t < c.start) continue;
            // The fade-in's held end state would override the opacity set below.
            c.labelIn?.cancel();
            c.labelIn = null;
            const s = Math.min(1, (t - c.start) / c.dur);
            const u = easeCubicInOut(s);
            const nr = c.target.name.getBoundingClientRect();
            const x0 = c.cx;
            const y0 = c.cy + maxR + 14;
            const x1 = nr.left + c.label.offsetWidth / 2;
            const y1 = nr.top;
            c.label.style.left = `${lerp(x0, x1, u)}px`;
            c.label.style.top = `${lerp(y0, y1, u)}px`;
            // Gone before it reaches the real row name, so the two never read double.
            c.label.style.opacity = String(1 - Math.min(1, Math.max(0, (u - 0.2) / 0.4)));
          }
        }

        draw(overlay.ctx, dots.filter((d) => !d.target || t < d.cluster.start + d.cluster.dur));
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
