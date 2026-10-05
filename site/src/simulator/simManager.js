// The Ecosystem Simulator page (#sim-1): the standalone factory simulator
// (public/simulator/index.html, synced from preview/Factory_Simulator.html by
// `npm run sync:sim`) in an iframe filling the window under the site header.
// The simulator scales its own 1920 × 1080 stage to whatever size it gets.
//
// The iframe lives in its own fixed host outside #scene-root and is created
// once: leaving the page only hides it, so its sliders keep their settings.
export const SIM_URL = `${import.meta.env.BASE_URL}simulator/index.html`;

let host = null;
let frame = null;
let ready = null; // resolves once the simulator has loaded

function fitHost() {
  if (!host) return;
  const header = document.querySelector('.site-header');
  host.style.setProperty('--sim-top', `${Math.ceil(header ? header.offsetHeight : 0)}px`);
}

// The frame, created (and loading) on first use.
export function simFrame() {
  if (!frame) {
    host = document.createElement('div');
    host.id = 'sim-host';
    host.className = 'sim-host';
    frame = document.createElement('iframe');
    frame.className = 'sim-frame';
    frame.title = 'Electronics Manufacturing Ecosystem simulator';
    ready = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    frame.src = SIM_URL;
    host.append(frame);
    document.querySelector('#page-grid').after(host);
    fitHost();
    window.addEventListener('resize', fitHost);
  }
  return frame;
}

export const simReady = () => {
  simFrame();
  return ready;
};

// Where the simulator's building image is on screen (its #scene <img>), read
// from inside the frame once it has loaded.
export function simSceneRect() {
  const img = frame?.contentDocument?.getElementById('scene');
  if (!img) return null;
  const f = frame.getBoundingClientRect();
  const r = img.getBoundingClientRect();
  if (!r.width) return null;
  return { left: f.left + r.left, top: f.top + r.top, width: r.width, height: r.height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}

export function createSimManager({ root }) {
  const scenes = [{ id: 1, navLabel: 'Simulator' }];

  const onHash = () => {
    if (!/^#sim-\d+$/.test(window.location.hash)) return;
    simFrame();
    fitHost();
    window.scrollTo(0, 0);
    // Nothing of another page stays in #scene-root (it is hidden here anyway).
    root.replaceChildren();
  };
  window.addEventListener('hashchange', onHash);

  // Load the simulator in the background soon after the site opens, so the
  // first visit (and the floors' flight into it) does not wait for it.
  setTimeout(simFrame, 1500);

  return {
    scenes,
    start: onHash,
    invalidate: () => {},
  };
}
