// Shared pieces for the scene transitions: a fixed canvas overlay with a skip
// control, a still of the outgoing page, and the curve maths.

export function seededRandom(seed = 12) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;

export function bezier(c, u) {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const cc = 3 * v * u * u;
  const d = u * u * u;
  return {
    x: a * c.p0.x + b * c.p1.x + cc * c.p2.x + d * c.p3.x,
    y: a * c.p0.y + b * c.p1.y + cc * c.p2.y + d * c.p3.y,
  };
}

// Screen position of an SVG-space point.
export function toScreen(svg, x, y) {
  const m = svg.getScreenCTM();
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, scale: Math.hypot(m.a, m.b) };
}

export function createOverlay(onSkip) {
  const wrap = document.createElement('div');
  wrap.className = 'transition-overlay';
  const canvas = document.createElement('canvas');
  wrap.append(canvas);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'transition-skip';
  skip.textContent = 'Skip animation';
  skip.addEventListener('click', onSkip);
  wrap.append(skip);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  document.body.append(wrap);
  return { wrap, canvas, ctx };
}

// A full-window still of the page as it was (ground, header, outgoing scene),
// so the swap underneath — and any scroll it needs — is invisible while it
// dissolves. The outgoing scene element itself is moved in, pinned in place.
export function snapshot(fromEl) {
  const ghost = document.createElement('div');
  ghost.className = 'transition-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const pin = (node, rect) => {
    Object.assign(node.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
    ghost.append(node);
  };
  const header = document.querySelector('.site-header');
  if (header) pin(header.cloneNode(true), header.getBoundingClientRect());
  const rect = fromEl.getBoundingClientRect();
  fromEl.style.animation = 'none';
  pin(fromEl, rect);
  return ghost;
}

// Bring the new scene's top into view if the page was scrolled past it.
export function scrollToScene(root) {
  const top = root.getBoundingClientRect().top;
  if (top < 0) window.scrollBy(0, top - 16);
}
