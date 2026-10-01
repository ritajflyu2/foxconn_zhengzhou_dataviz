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

export function addCaveat(el, ...parts) {
  const text = parts.filter(Boolean).join(' ');
  if (!text) return;

  const note = document.createElement('p');
  note.className = 'caveat';
  const strong = document.createElement('strong');
  strong.textContent = 'Caveat: ';
  note.append(strong, document.createTextNode(text));
  el.append(note);
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
