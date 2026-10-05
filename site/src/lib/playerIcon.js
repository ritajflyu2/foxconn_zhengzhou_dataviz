// Play / Pause / Replay as a small icon (no text on screen); the state is
// still named for screen readers through aria-label.
const PATHS = {
  play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor"/>',
  pause: '<rect x="4" y="3.5" width="2.6" height="9" rx="0.6" fill="currentColor"/><rect x="9.4" y="3.5" width="2.6" height="9" rx="0.6" fill="currentColor"/>',
  replay:
    '<path d="M12.6 8a4.6 4.6 0 1 1-1.35-3.25" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12.9 2.4v3.3H9.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};
const LABELS = { play: 'Play', pause: 'Pause', replay: 'Replay' };

export function setPlayerIcon(button, state) {
  if (button.dataset.state === state) return;
  button.dataset.state = state;
  button.innerHTML = `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">${PATHS[state]}</svg>`;
  button.setAttribute('aria-label', LABELS[state]);
  button.title = LABELS[state];
}
