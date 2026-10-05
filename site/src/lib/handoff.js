// A one-shot note from one page to the next, for a transition that crosses
// pages: the Introduction's last screen sets it just before it changes the
// hash, and Labor's scene manager takes it when it shows the scene asked for.
let pending = null;

export function setHandoff(kind) {
  pending = { kind, at: performance.now() };
}

// The pending hand-off, once; stale ones (over a second old) are dropped.
export function takeHandoff() {
  const p = pending;
  pending = null;
  return p && performance.now() - p.at < 1000 ? p.kind : null;
}
