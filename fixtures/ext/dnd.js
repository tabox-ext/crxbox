const list = document.getElementById('list');
let dragging = null;
let startX = 0;
let startY = 0;
let activated = false;

list.addEventListener('pointerdown', (e) => {
  const item = e.target.closest('[data-item]');
  if (!item) return;
  dragging = item;
  startX = e.clientX;
  startY = e.clientY;
  activated = false;
});

window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (!activated && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
    activated = true; // crossed the activation distance — drag really starts
  }
});

window.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  if (activated) {
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-item]');
    if (under && under !== dragging) under.after(dragging); // drop after the target row
  }
  dragging = null;
  activated = false;
});
