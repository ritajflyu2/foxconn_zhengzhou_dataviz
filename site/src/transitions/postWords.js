import { format, select } from 'd3';
import cloud from 'd3-cloud';
import { createTooltip } from '../lib/tooltip.js';
import { colorFor } from '../lib/colorTokens.js';
import { seededRandom } from './common.js';

// The words layer of the 3 → 4 transition: the most-used words in the summaries
// of all scraped hiring posts, laid out with d3-cloud and sized by the share of
// posts that use them, each shown as its English gloss followed by the Chinese
// original in the same size and colour. Each word is coloured by the post group
// whose posts use it most (scene4_post_words.json), so it ties to the labelled
// clusters above.

const MIN_FONT = 15;
const MAX_FONT = 80;
const PAD_PX = 4; // space kept around each word (d3-cloud pads every side; mainly opens up the rows)
// Inter has no Chinese glyphs: the CJK fallbacks set the Chinese half, and the
// same stack is used for layout so d3-cloud measures what is drawn.
const FONT_FAMILY = "Inter, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
const label = (w) => `${w.word} ${w.zh}`;
const FONT_WEIGHT = 600;
const SIZE_EXP = 0.7;
const pct = format('.0%');
const count = format(',');

function runCloud(words, width, height, scale) {
  const maxShare = Math.max(...words.map((w) => w.share));
  // Font size grows with the share, between the square root (too flat) and
  // straight proportion (too steep); floored so the rarest stay legible.
  const size = (w) => Math.max(MIN_FONT, scale * (w.share / maxShare) ** SIZE_EXP);
  return new Promise((resolve) => {
    cloud()
      .size([width, height])
      .words(words.map((w) => ({ ...w, text: label(w), size: size(w) })))
      .padding(PAD_PX)
      .rotate(0)
      .font(FONT_FAMILY)
      .fontWeight(FONT_WEIGHT)
      .fontSize((d) => d.size)
      .spiral('archimedean') // an organic, rounded cloud rather than a filled rectangle
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
export async function createPostWords(parent, data, box) {
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
  sub.textContent = `The most-used words in the summaries of all ${count(data.total_posts)} hiring posts from ${data.year_range[0]}–${data.year_range[1]}. Most words carry a sense of urgency and friendliness. Different pay schemes are emphasized. Hover over a word to see its count.`;
  const how = document.createElement('details');
  how.className = 'post-words__how';
  const howSum = document.createElement('summary');
  howSum.textContent = 'How the words were picked';
  const howText = document.createElement('p');
  // The data's limits live here too, so the cloud gets the whole space below.
  howText.textContent = `${data.method} ${data.color_rule} ${data.caveat}`;
  how.append(howSum, howText);
  titles.append(title, sub);
  head.append(titles);
  // The method note sits under the cloud (it opens upward, over the words).
  const foot = document.createElement('div');
  foot.className = 'post-words__foot';
  foot.append(how);

  el.append(head, foot);
  parent.append(el);

  const headH = head.getBoundingClientRect().height + 12;
  const footH = foot.getBoundingClientRect().height + 8;
  const cloudBox = { left: box.left, top: box.top + headH, width: box.width, height: Math.max(120, box.height - headH - footH) };
  Object.assign(foot.style, { left: `${box.left}px`, top: `${cloudBox.top + cloudBox.height + 8}px`, width: `${box.width}px` });

  // Words wear their group's own colour, exactly as the clusters' dots above.
  const groupColor = Object.fromEntries(data.types.map((t) => [t.key, colorFor(t.key)]));
  const shadeOf = (d) => groupColor[d.type];
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
    t.textContent = `“${w.word}” (${w.zh})`;
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
    .style('font-family', FONT_FAMILY)
    .style('font-weight', FONT_WEIGHT)
    .style('font-size', (d) => `${d.size}px`)
    .style('fill', shadeOf)
    .style('opacity', 0)
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `${d.word} (${d.zh}): in ${count(d.posts)} of ${count(data.total_posts)} post summaries (${pct(d.share)}), ${count(d.mentions)} mentions; used most in ${d.type_label.toLowerCase()} posts`)
    .text(label);

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
      fade(foot, 0);
      texts.each(function (_d, i) {
        fade(this, 250 + i * 30);
      });
    },
    hide() {
      tooltip.hide();
      return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
    },
  };
}
