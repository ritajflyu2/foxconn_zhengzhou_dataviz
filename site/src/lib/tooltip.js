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
    // Beside the pointer instead of above a point: to its right, or its left
    // when there is no room, vertically centred on it, so the card never sits
    // on top of what is being hovered.
    showBeside(node, event) {
      el.replaceChildren(node);
      el.hidden = false;
      const bounds = parent.getBoundingClientRect();
      const { width, height } = el.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      const GAP = 18;
      const x = px + GAP + width <= bounds.width ? px + GAP : Math.max(0, px - GAP - width);
      const y = Math.min(Math.max(py - height / 2, -bounds.top + 8), bounds.height - height);
      el.style.transform = `translate(${x}px, ${y}px)`;
    },
    // Outside a circle, on the side the pointer is on: right half -> card to
    // the circle's right, left half -> to its left, level with the pointer.
    showOutside(node, event, circleEl) {
      el.replaceChildren(node);
      el.hidden = false;
      const bounds = parent.getBoundingClientRect();
      // A ring drawn as a thick stroke reaches half its stroke beyond its radius.
      const box = circleEl.getBoundingClientRect();
      const r = Number(circleEl.getAttribute('r')) || box.width / 2;
      const sw = circleEl.getAttribute('fill') === 'none' ? Number(circleEl.getAttribute('stroke-width')) || 0 : 0;
      const grow = (sw / 2) * (box.width / (2 * r));
      const c = { left: box.left - grow, right: box.right + grow, width: box.width + 2 * grow };
      const { width, height } = el.getBoundingClientRect();
      const GAP = 12;
      const right = event.clientX >= c.left + c.width / 2;
      let x = right ? c.right + GAP - bounds.left : c.left - GAP - width - bounds.left;
      if (x + width > bounds.width) x = c.left - GAP - width - bounds.left; // no room: other side
      if (x < -bounds.left + 4) x = c.right + GAP - bounds.left;
      const py = event.clientY - bounds.top;
      const y = Math.min(Math.max(py - height / 2, -bounds.top + 8), bounds.height - height);
      el.style.transform = `translate(${x}px, ${y}px)`;
    },
    hide() {
      el.hidden = true;
    },
  };
}
