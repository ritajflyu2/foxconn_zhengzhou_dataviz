// CSS custom properties in styles/tokens.css are the single source of truth for
// color. D3 needs real color strings, so read the computed values instead of
// repeating the hex codes here.
const WORKER_TYPES = [
  'regular',
  'dispatch',
  'rebate-dispatch',
  'hourly-dispatch',
  'student',
  'short-term',
  'legal-cap',
  'comparison',
  'estimate-range',
];

const read = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Any token, e.g. cssVar('--ink'). Throws if the token is undefined.
export function cssVar(name) {
  const value = read(name);
  if (!value) throw new Error(`No CSS token "${name}"`);
  return value;
}

export function workerColors() {
  return Object.fromEntries(WORKER_TYPES.map((t) => [t, read(`--color-${t}`)]));
}

// JSON uses snake_case color keys (e.g. "hourly_dispatch").
export function colorFor(key) {
  const color = read(`--color-${String(key).replace(/_/g, '-')}`);
  if (!color) throw new Error(`No color token for "${key}"`);
  return color;
}
