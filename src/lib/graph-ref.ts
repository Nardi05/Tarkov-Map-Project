import type { Progression } from "../types.ts";

/**
 * The task graph, once it has loaded, for code that cannot wait on a hook.
 *
 * The store fills in the chain behind a quest marked active (see
 * prereq-fill.ts), and store actions run outside React. The loader sets this
 * the moment the graph arrives; until then it is null and those writes simply
 * skip the fill — Settings → Recalc covers anything ticked that early.
 */
let current: Progression | null = null;

export function setCurrentGraph(graph: Progression): void {
  current = graph;
}

export function currentGraph(): Progression | null {
  return current;
}
