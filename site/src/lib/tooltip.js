// One tooltip per scene, positioned inside a figure that is position:relative.
export function createTooltip(parent) {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.hidden = true;
  parent.append(el);

  return {
    show(node, anchor) {
      el.replaceChildren(node);
      el.hidden = false;

      const bounds = parent.getBoundingClientRect();
      const { width, height } = el.getBoundingClientRect();
      const x = Math.min(Math.max(anchor.x - width / 2, 8), bounds.width - width - 8);
      const y = anchor.y - height - 14 < 8 ? anchor.y + 18 : anchor.y - height - 14;

      el.style.transform = `translate(${x}px, ${y}px)`;
    },
    hide() {
      el.hidden = true;
    },
  };
}
