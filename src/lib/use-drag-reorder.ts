import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Drag one card in a list onto another and drop it there.
 *
 * Pointer events rather than HTML5 drag-and-drop, for one reason: the HTML5 API
 * does not fire on touch at all, and a dashboard somebody rearranges on their
 * phone is the case this exists for. Pointer events are one code path for
 * mouse, pen and finger.
 *
 * The list is deliberately *not* rearranged while the pointer is down. Every
 * "reorder live as you cross a midpoint" scheme has to re-measure after each
 * swap, and a card that jumps out from under the pointer and then re-measures
 * can oscillate between two positions for as long as you hold still. Instead
 * the geometry is measured once at drag start, the dragged card follows the
 * pointer, the card it is over is marked as the target, and the move happens on
 * release — from numbers that cannot have gone stale.
 */
export interface DragReorder {
  /** Index being dragged, or null when nothing is. */
  from: number | null;
  /** Index it would land on. */
  to: number | null;
  /** How far the dragged card has travelled, for its transform. */
  offset: { x: number; y: number };
  /** Ref callback for each draggable card, in render order. */
  register: (index: number) => (el: HTMLElement | null) => void;
  /** Pointer-down handler for a card's drag handle. */
  start: (index: number) => (event: ReactPointerEvent<HTMLElement>) => void;
}

interface Session {
  from: number;
  to: number;
  startX: number;
  startY: number;
  rects: { index: number; rect: DOMRect }[];
}

export function useDragReorder(onDrop: (from: number, to: number) => void): DragReorder {
  const elements = useRef(new Map<number, HTMLElement>());
  const session = useRef<Session | null>(null);

  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const register = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) elements.current.set(index, el);
      else elements.current.delete(index);
    },
    [],
  );

  const start = useCallback(
    (index: number) => (event: ReactPointerEvent<HTMLElement>) => {
      // Secondary buttons belong to the context menu, not to a drag.
      if (event.button !== 0) return;

      const rects = [...elements.current.entries()]
        .map(([i, el]) => ({ index: i, rect: el.getBoundingClientRect() }))
        .sort((a, b) => a.index - b.index);
      if (rects.length < 2) return;

      session.current = {
        from: index,
        to: index,
        startX: event.clientX,
        startY: event.clientY,
        rects,
      };
      setFrom(index);
      setTo(index);
      setOffset({ x: 0, y: 0 });

      // Capture so the drag survives the pointer leaving the handle — which it
      // does immediately, since the card moves out from under it.
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [],
  );

  const dragging = from != null;

  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => {
      const active = session.current;
      if (!active) return;
      setOffset({ x: event.clientX - active.startX, y: event.clientY - active.startY });

      const hit = active.rects.find(
        ({ rect }) =>
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      );
      // Outside every card the last target stands: dragging through the gutter
      // between two columns should not silently cancel the move.
      if (hit && hit.index !== active.to) {
        active.to = hit.index;
        setTo(hit.index);
      }
    };

    /*
     * The target is read from the session rather than from `to`, so a release
     * in the same frame as the last move still commits where the pointer
     * actually was rather than one position behind it.
     */
    const end = (commit: boolean) => {
      const active = session.current;
      session.current = null;
      setFrom(null);
      setTo(null);
      setOffset({ x: 0, y: 0 });
      if (commit && active && active.to !== active.from) onDrop(active.from, active.to);
    };

    const up = () => end(true);
    const cancel = () => end(false);
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      end(false);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragging, onDrop]);

  return { from, to, offset, register, start };
}
