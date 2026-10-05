import { format } from 'd3';
import { setPlayerIcon } from '../lib/playerIcon.js';

// Pieces shared by the Waste and Water Processing screens.

export const two = format(',.2~f');
const TWEEN_MS = 500; // shorter than one year's step (Labor Scene 3's pace)

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// The screen shell, in the Introduction / Labor shape.
export function createScene(index) {
  const el = document.createElement('section');
  el.className = 'scene';
  el.id = `env-scene-${index}`;
  const head = document.createElement('div');
  head.innerHTML = '<p class="scene__index">Waste and Water Processing</p><h2></h2><p class="scene__summary"></p>';
  const body = document.createElement('div');
  body.className = 'scene__body';
  el.append(head, body);
  return { el, head, body };
}

// Labor Scene 3's play / pause + year scrubber, copied as is; the one change is
// that it starts when the scene scrolls into view instead of on mount.
export function playerControls(container, { years, secondsPerYear, onReveal }) {
  const row = document.createElement('div');
  row.className = 'player-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'player-btn';

  const scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.min = '0';
  scrubber.max = String(years.length - 1);
  scrubber.className = 'player-scrubber';
  scrubber.setAttribute('aria-label', 'Year');

  const yearReadout = document.createElement('span');
  yearReadout.className = 'player-year';

  row.append(button, scrubber, yearReadout);
  container.append(row);

  let revealCount = reducedMotion() ? years.length : 0;
  let playing = false;
  let timer = null;

  function sync() {
    scrubber.value = String(Math.max(0, revealCount - 1));
    scrubber.setAttribute('aria-valuetext', revealCount > 0 ? String(years[revealCount - 1].year) : `Before ${years[0].year}`);
    yearReadout.textContent = revealCount > 0 ? String(years[Math.min(revealCount, years.length) - 1].year) : String(years[0].year);
    setPlayerIcon(button, playing ? 'pause' : revealCount >= years.length ? 'replay' : 'play');
    onReveal(revealCount, playing);
  }

  function stop() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function tick() {
    revealCount += 1;
    if (revealCount >= years.length) {
      revealCount = years.length;
      stop();
    }
    sync();
  }

  function play() {
    if (revealCount >= years.length) revealCount = 0;
    playing = true;
    sync();
    timer = setInterval(tick, secondsPerYear * 1000);
  }

  button.addEventListener('click', () => {
    if (playing) {
      stop();
      sync();
    } else {
      play();
    }
  });

  scrubber.addEventListener('input', () => {
    stop();
    revealCount = Number(scrubber.value) + 1;
    sync();
  });

  sync();
  return { play, stop };
}

export function counter(parent, label, color, unitText) {
  const wrap = document.createElement('div');
  const l = document.createElement('p');
  l.className = 'prod-counter__label';
  const sw = document.createElement('span');
  sw.className = 'env-counter__swatch';
  sw.style.background = color;
  l.append(sw, document.createTextNode(label));
  const v = document.createElement('p');
  v.className = 'prod-counter__value';
  const num = document.createElement('span');
  const unit = document.createElement('small');
  unit.className = 'env-counter__unit';
  unit.textContent = ` ${unitText}`;
  v.append(num, unit);
  const note = document.createElement('p');
  note.className = 'env-counter__note';
  wrap.append(l, v, note);
  parent.append(wrap);
  // Tweens to each new value (jumps under reduced motion).
  let shown = 0;
  let raf = null;
  return (target, noteText = '') => {
    note.textContent = noteText;
    cancelAnimationFrame(raf);
    if (reducedMotion()) {
      shown = target;
      num.textContent = two(target);
      return;
    }
    const from = shown;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / TWEEN_MS);
      shown = from + (target - from) * (1 - (1 - k) ** 3);
      num.textContent = two(shown);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
}

