import { createScene, addCaveat } from './sceneShell.js';

// Placeholder body for the scenes that are not built yet.
export function renderScene(container, scene) {
  const { index, title, summary, stageLabel, proof, caveat, source } = scene;
  const { el, body } = createScene({ index, title, summary });

  const stage = document.createElement('div');
  stage.className = 'scene__stage';

  const label = document.createElement('p');
  label.className = 'scene__stage-label';
  label.textContent = stageLabel;
  stage.append(label);

  const row = document.createElement('div');
  row.className = 'proof';
  if (proof.color) {
    const swatch = document.createElement('span');
    swatch.className = 'proof__swatch';
    swatch.style.background = proof.color;
    row.append(swatch);
  }
  const value = document.createElement('p');
  value.className = 'proof__value';
  value.textContent = proof.value;
  row.append(value);
  stage.append(row);

  const desc = document.createElement('p');
  desc.className = 'proof__label';
  desc.textContent = proof.label;
  if (proof.placeholder) {
    const tag = document.createElement('span');
    tag.className = 'tag-placeholder';
    tag.textContent = 'Placeholder';
    desc.append(tag);
  }
  stage.append(desc);

  const src = document.createElement('p');
  src.className = 'proof__source';
  src.textContent = `Source file: ${proof.file}`;
  stage.append(src);

  body.append(stage);
  addCaveat(el, caveat, source);

  container.replaceChildren(el);
}
