import { format, select, hcl } from 'd3';
import cloud from 'd3-cloud';
import { createTooltip } from '../lib/tooltip.js';
import { colorFor, cssVar } from '../lib/colorTokens.js';
import { seededRandom } from './common.js';

// The words layer of the 3 → 4 transition: the most-used words in the summaries
// of all scraped hiring posts, laid out with d3-cloud and sized by the share of
// posts that use them. Each word is coloured by the worker type whose posts use
// it most (scene4_post_words.json), so it ties to the labelled clusters above.

const MIN_FONT = 13;
const MAX_FONT = 68;
const PAD_PX = 3;
const FONT_FAMILY = 'Inter';
const FONT_WEIGHT = 600;
const TEXT_CONTRAST = 4.5; // normal text
const LARGE_TEXT_CONTRAST = 3; // WCAG large text: ≥ 18.66px bold — most of the cloud
const LARGE_TEXT_PX = 18.66;
// Hourly-type's brown is set a step darker as text, so it stays apart from the
// darkened rebate-type orange next to it.
const MIN_CONTRAST_BY_TYPE = { hourly_dispatch: 6.5 };

const pct = format('.0%');
const count = format(',');

function luminance(c) {
  const { r, g, b } = c.rgb();
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// The type's own hue, darkened only as far as needed to read as text on the ground.
function textShade(color, ground, minRatio) {
  const bg = luminance(hcl(ground));
  const c = hcl(color);
  for (let i = 0; i < 60; i++) {
    const ratio = (bg + 0.05) / (luminance(c) + 0.05);
    if (ratio >= minRatio) break;
    c.l -= 1;
  }
  return c.formatHex();
}

function runCloud(words, width, height, scale) {
  const maxShare = Math.max(...words.map((w) => w.share));
  const size = (w) => Math.max(MIN_FONT, scale * (MIN_FONT / MAX_FONT + (1 - MIN_FONT / MAX_FONT) * Math.sqrt(w.share / maxShare)));
  return new Promise((resolve) => {
    cloud()
      .size([width, height])
      .words(words.map((w) => ({ ...w, text: w.word, size: size(w) })))
      .padding(PAD_PX)
      .rotate(0)
      .font(FONT_FAMILY)
      .fontWeight(FONT_WEIGHT)
      .fontSize((d) => d.size)
      .spiral('archimedean')
      .random(seededRandom(7))
      .on('end', resolve)
      .start();
  });
}

// Largest scale at which every word fits.
async function layout(words, width, height) {
  for (let scale = MAX_FONT; scale >= MIN_FONT; scale *= 0.92) {
    const placed = await runCloud(words, width, height, scale);
    if (placed.length === words.length) return placed;
  }
  return runCloud(words, width, height, MIN_FONT);
}

// Builds the layer inside `parent` (the fixed transition overlay).
export async function createPostWords(parent, data, box, { onContinue }) {
  const el = document.createElement('div');
  el.className = 'post-words';
  el.style.opacity = '0';

  const head = document.createElement('div');
  head.className = 'post-words__head';
  Object.assign(head.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` });
  const titles = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'post-words__title';
  title.textContent = 'What the hiring posts say';
  const sub = document.createElement('p');
  sub.className = 'post-words__sub';
  sub.textContent = `The most-used words in the summaries of all ${count(data.total_posts)} hiring posts, ${data.year_range[0]}–${data.year_range[1]}, sized by the share of posts that use them and coloured by the worker type above whose posts use them most. Hover a word for its count.`;
  titles.append(title, sub);
  const cont = document.createElement('button');
  cont.type = 'button';
  cont.className = 'player-btn post-words__continue';
  cont.textContent = 'Continue →';
  cont.addEventListener('click', onContinue);
  head.append(titles, cont);

  const caveat = document.createElement('p');
  caveat.className = 'post-words__caveat';
  caveat.textContent = `Caveat: ${data.caveat} ${data.method} ${data.color_rule}`;
  Object.assign(caveat.style, { left: `${box.left}px`, width: `${box.width}px` });
  el.append(head, caveat);
  parent.append(el);

  const headH = head.getBoundingClientRect().height + 12;
  const capH = caveat.getBoundingClientRect().height + 8;
  caveat.style.top = `${box.top + box.height - capH + 8}px`;
  const cloudBox = { left: box.left, top: box.top + headH, width: box.width, height: Math.max(120, box.height - headH - capH) };

  const ground = cssVar('--surface');
  const shades = (bar) =>
    Object.fromEntries(data.types.map((t) => [t.key, textShade(colorFor(t.key), ground, Math.max(bar, MIN_CONTRAST_BY_TYPE[t.key] ?? 0))]));
  const shadeSmall = shades(TEXT_CONTRAST);
  const shadeLarge = shades(LARGE_TEXT_CONTRAST);
  const shadeOf = (d) => (d.size >= LARGE_TEXT_PX ? shadeLarge : shadeSmall)[d.type];
  const placed = await layout([...data.words].sort((a, b) => b.share - a.share), cloudBox.width, cloudBox.height);

  const svg = select(el)
    .append('svg')
    .attr('class', 'post-words__cloud')
    .attr('width', cloudBox.width)
    .attr('height', cloudBox.height)
    .style('left', `${cloudBox.left}px`)
    .style('top', `${cloudBox.top}px`)
    .attr('role', 'img')
    .attr('aria-label', `Word cloud of the most-used words in ${count(data.total_posts)} hiring post summaries`);
  const g = svg.append('g').attr('transform', `translate(${cloudBox.width / 2}, ${cloudBox.height / 2})`);

  const tooltip = createTooltip(el);
  const card = (w) => {
    const wrap = document.createElement('div');
    const t = document.createElement('p');
    t.className = 'tooltip__title';
    t.textContent = `“${w.word}”`;
    const list = document.createElement('dl');
    for (const [k, v] of [
      ['Posts using it', `${count(w.posts)} of ${count(data.total_posts)}`],
      ['Share of all posts', pct(w.share)],
      ['Mentions in total', count(w.mentions)],
      [`Share of ${w.type_label.toLowerCase()} posts`, `${pct(w.type_share)} (${count(w.type_posts)} of ${count(w.type_total)})`],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      list.append(dt, dd);
    }
    wrap.append(t, list);
    return wrap;
  };

  const texts = g
    .selectAll('text')
    .data(placed)
    .join('text')
    .attr('class', 'post-words__word')
    .attr('text-anchor', 'middle')
    .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
    .style('font-family', `${FONT_FAMILY}, system-ui, sans-serif`)
    .style('font-weight', FONT_WEIGHT)
    .style('font-size', (d) => `${d.size}px`)
    .style('fill', shadeOf)
    .style('opacity', 0)
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `${d.word}: in ${count(d.posts)} of ${count(data.total_posts)} post summaries (${pct(d.share)}), ${count(d.mentions)} mentions; used most in ${d.type_label.toLowerCase()} posts`)
    .text((d) => d.word);

  const show = (event, d) => {
    const r = event.currentTarget.getBoundingClientRect();
    const p = el.getBoundingClientRect();
    tooltip.show(card(d), { x: r.left + r.width / 2 - p.left, y: r.top - p.top });
  };
  texts.on('pointerenter', show).on('focus', show).on('pointerleave', () => tooltip.hide()).on('blur', () => tooltip.hide());

  return {
    el,
    show(reduced) {
      el.style.opacity = '';
      const fade = (node, delay) =>
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 0 : 420, delay: reduced ? 0 : delay, easing: 'ease-out', fill: 'forwards' });
      fade(head, 0);
      fade(caveat, 700);
      texts.each(function (_d, i) {
        fade(this, 250 + i * 30);
      });
      cont.focus({ preventScroll: true });
    },
    hide() {
      tooltip.hide();
      return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
    },
  };
}
