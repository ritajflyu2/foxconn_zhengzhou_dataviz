// Heading + body + caveat, shared by every scene.
export function createScene({ index, title, summary }) {
  const el = document.createElement('section');
  el.className = 'scene';
  el.id = `scene-${index}`;

  const head = document.createElement('div');
  head.innerHTML = `
    <p class="scene__index">Scene ${index}</p>
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

// The data's limits: no longer a block of its own under every chart (it took
// a screen's worth of room); its text goes into the screen's collapsed notes,
// so it is still there, in place, one click away.
export function addCaveat(el, ...parts) {
  const text = parts.filter(Boolean).join(' ');
  if (!text) return;
  let details = el.querySelector(':scope > details.method');
  if (!details) {
    details = document.createElement('details');
    details.className = 'method';
    const label = document.createElement('summary');
    label.textContent = 'Limits of the data';
    details.append(label);
    el.append(details);
  }
  const p = document.createElement('p');
  p.className = 'method__limits';
  p.textContent = text;
  details.append(p);
}

// Collapsed by default so the method is available without crowding the chart.
export function addMethodNote(el, summary, paragraphs) {
  const details = document.createElement('details');
  details.className = 'method';

  const label = document.createElement('summary');
  label.textContent = summary;
  details.append(label);

  for (const text of paragraphs.filter(Boolean)) {
    const p = document.createElement('p');
    p.textContent = text;
    details.append(p);
  }

  el.append(details);
}
