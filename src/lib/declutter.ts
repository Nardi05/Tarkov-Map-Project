/**
 * Marker labels overlap badly when a map is zoomed out — several extracts sit
 * within a few metres of each other in the corners of Customs and Lighthouse.
 *
 * Rather than hiding labels below some zoom threshold (which takes the names
 * away exactly when a new player is getting oriented), we place them greedily:
 * walk the labels in priority order and drop any whose box collides with one
 * already placed. Zoom in and the collisions resolve themselves, so labels
 * reappear as space opens up.
 */

interface Box {
  el: HTMLElement;
  left: number;
  top: number;
  right: number;
  bottom: number;
  priority: number;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function declutterLabels(container: HTMLElement) {
  const labels = container.querySelectorAll<HTMLElement>(".marker-label, .tk-place-label span");
  if (labels.length === 0) return;

  // Measure everything visible first: reading after any write would thrash layout.
  for (const el of labels) el.classList.remove("is-crowded");

  const view = container.getBoundingClientRect();
  const boxes: Box[] = [];

  for (const el of labels) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right < view.left || r.left > view.right || r.bottom < view.top || r.top > view.bottom) {
      continue;
    }
    // A label running off the edge of the map reads as a truncated word, which
    // is worse than no label at all.
    if (r.left < view.left || r.right > view.right) {
      el.classList.add("is-crowded");
      continue;
    }
    boxes.push({
      el,
      // A small margin keeps neighbours from touching.
      left: r.left - 2,
      top: r.top - 1,
      right: r.right + 2,
      bottom: r.bottom + 1,
      priority: Number(el.dataset.priority ?? 0),
    });
  }

  boxes.sort((a, b) => b.priority - a.priority || a.top - b.top || a.left - b.left);

  const placed: Box[] = [];
  for (const box of boxes) {
    if (placed.some((other) => overlaps(box, other))) box.el.classList.add("is-crowded");
    else placed.push(box);
  }
}

/** Coalesces bursts of map events into one pass per frame. */
export function createDeclutterer(container: HTMLElement) {
  let frame = 0;
  return () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      declutterLabels(container);
    });
  };
}
