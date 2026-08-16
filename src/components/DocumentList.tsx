import { useMemo, useState } from "react";
import type { DocumentSpawn, TaskImage } from "../types";
import TaskGallery from "./TaskGallery";

/**
 * Every battle-pass document spawn on one map, grouped by where it is.
 *
 * This exists because most of them cannot be drawn. The wiki describes these
 * in prose — "inside 3 story dorms, in room 304 on the nightstand" — and only
 * the ones whose wording names a place we have a label for get a pin. That is
 * 109 of 265; the other 156 were shipped in the payload and rendered nowhere,
 * which on the Labyrinth and Icebreaker meant the layer had literally nothing
 * to show while the data sat there with photos attached.
 *
 * So the list is the primary surface for this layer and the map is the bonus,
 * rather than the other way round. A description plus a screenshot is enough to
 * find a document; a pin that says "somewhere in Dorms" is a convenience on top.
 */

/** The gallery's shape, from spawns. Shared with DetailPanel so it stays one mapping. */
export function documentImages(spawns: DocumentSpawn[]): TaskImage[] {
  return spawns
    .filter((s) => s.image)
    .map((s) => ({
      url: s.image as string,
      width: s.imageWidth,
      height: s.imageHeight,
      title: s.note,
    }));
}

const UNPLACED = "Somewhere on this map";

export default function DocumentList({ spawns }: { spawns: DocumentSpawn[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  /* Pinned spawns first, grouped by building; the unplaced ones last, so the
     list reads as "here is where we can point you, then here is the rest". */
  const groups = useMemo(() => {
    const byPlace = new Map<string, DocumentSpawn[]>();
    for (const spawn of spawns) {
      const key = spawn.place ?? UNPLACED;
      const bucket = byPlace.get(key);
      if (bucket) bucket.push(spawn);
      else byPlace.set(key, [spawn]);
    }
    return [...byPlace.entries()].sort(([a], [b]) =>
      a === UNPLACED ? 1 : b === UNPLACED ? -1 : a.localeCompare(b),
    );
  }, [spawns]);

  const images = useMemo(() => documentImages(spawns), [spawns]);
  const index = Math.max(
    0,
    images.findIndex((i) => i.title === spawns.find((s) => s.id === selected)?.note),
  );

  return (
    <div className="flex flex-col gap-2 px-2 pb-2">
      {groups.map(([place, list]) => (
        <div key={place}>
          <p
            className="mb-1 text-[0.68rem] font-medium uppercase tracking-wide"
            style={{ color: "var(--text-faint)" }}
          >
            {place}
            {place === UNPLACED && (
              <span className="ml-1 normal-case tracking-normal opacity-80">
                — the wiki names no place we can put on the map
              </span>
            )}
          </p>
          <ul className="flex flex-col gap-1">
            {list.map((spawn) => {
              const active = spawn.id === selected;
              return (
                <li key={spawn.id}>
                  <button
                    type="button"
                    className="surface-2 block w-full rounded-md px-2.5 py-1.5 text-left text-[0.72rem] leading-snug transition-colors"
                    style={active ? { outline: "1px solid var(--accent)" } : undefined}
                    aria-pressed={active}
                    onClick={() => setSelected(active ? null : spawn.id)}
                  >
                    <span className="block opacity-60">{spawn.document}</span>
                    {spawn.note}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {images.length > 0 && (
        <div className="mt-1">
          <TaskGallery images={images} taskName="Battle pass documents" index={index} />
        </div>
      )}
    </div>
  );
}
