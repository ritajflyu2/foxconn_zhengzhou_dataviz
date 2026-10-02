// Heading + body shell for the Introduction page's own scenes — the same
// shape as the Labor page's sceneShell.js, but labelled "Introduction"
// instead of "Scene N" and on its own id namespace (intro-scene-N), so it
// never collides with a Labor scene section if both ever existed in the DOM
// at once. addCaveat/addMethodNote are generic (just take an element + text)
// so they're reused as-is from the Labor shell.
export { addCaveat, addMethodNote } from '../lib/sceneShell.js';

export function createScene({ index, title, summary }) {
  const el = document.createElement('section');
  el.className = 'scene';
  el.id = `intro-scene-${index}`;

  const head = document.createElement('div');
  head.innerHTML = `
    <p class="scene__index">Introduction</p>
    <h2></h2>
    <p class="scene__summary"></p>
  `;
  head.querySelector('h2').textContent = title;
  head.querySelector('.scene__summary').textContent = summary;

  const body = document.createElement('div');
  body.className = 'scene__body';

  el.append(head, body);
  return { el, body };
}
