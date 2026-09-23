import { useEffect, useId, useMemo, useRef, useState } from "react";
import { indexMap, searchMap, type SearchResult } from "../lib/map-index";
import { LAYER_BY_ID } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { Icon, icons } from "./ui";
import type { Floor } from "../lib/base-layer";
import type { MapData } from "../types";

/**
 * "Where is Dorm 220?"
 *
 * The site could already search maps and tasks, but not the pins on the map you
 * were actually looking at — so the only way to find one named thing among four
 * hundred was to turn its layer on and read. This answers the question
 * directly, and because every result knows its floor, picking one can take you
 * to the level it is on rather than flying to an empty patch of roof.
 *
 * Keyboard-first: arrows move, Enter picks, Escape clears. The list is not a
 * combobox because the results are destinations rather than values — picking
 * one moves the map and leaves the query in place, so you can try the next one.
 */
export default function MapSearch({
  data,
  floors,
  currentFloorId,
  initialQuery,
  onPick,
}: {
  data: MapData;
  floors: Floor[];
  currentFloorId: string;
  /** From `?find=` — a story step naming where it means, in its own words. */
  initialQuery: string | null;
  onPick: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  /*
   * Follow the link when it changes, but never fight the typing: a second story
   * step deep-linking into the same open map has to replace the query, and a
   * re-render must not.
   */
  const linked = useRef(initialQuery);
  useEffect(() => {
    if (initialQuery === linked.current) return;
    linked.current = initialQuery;
    setQuery(initialQuery ?? "");
    setCursor(0);
  }, [initialQuery]);

  // Indexing a map is a few thousand object literals and happens once per map.
  const points = useMemo(() => indexMap(data), [data]);
  const results = useMemo(() => searchMap(points, query, floors), [points, query, floors]);

  const pick = (result: SearchResult | undefined) => {
    if (!result) return;
    onPick(result);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => {
        const next = c + (e.key === "ArrowDown" ? 1 : -1);
        return Math.max(0, Math.min(results.length - 1, next));
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[cursor]);
    } else if (e.key === "Escape" && query) {
      // Stop here rather than letting the page's Escape handler also fire and
      // close the panel out from under a search that is still useful.
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
    }
  };

  return (
    <div className="px-3 pt-3">
      <label className="relative block">
        <span className="sr-only">Find on this map</span>
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-faint)" }}
          aria-hidden="true"
        >
          <Icon path={icons.search} size={14} />
        </span>
        <input
          ref={inputRef}
          className="input"
          style={{ paddingLeft: "2rem" }}
          type="search"
          placeholder="Find on this map…"
          value={query}
          role="searchbox"
          aria-controls={listId}
          aria-describedby={`${listId}-hint`}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
        />
      </label>

      <p id={`${listId}-hint`} className="sr-only">
        Extracts, keys, transits, bosses, switches and your task objectives. Use the arrow keys to
        move through results and Enter to go to one.
      </p>

      {query.trim().length >= 2 && (
        <div id={listId} className="mt-1.5" role="listbox" aria-label="Places on this map">
          {results.length === 0 ? (
            /*
             * A dead end with a way out. This is reached most often from a
             * story step's map link, where the wiki's wording and the map's own
             * labels are simply different vocabularies — the wiki says "Eastern
             * Woods wreck" and the map says "Crash Site". Saying what was
             * looked for, and what to try instead, beats an empty box.
             */
            <p className="px-2 py-2 text-[0.72rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
              Nothing on {data.name} is called “{query.trim()}”. Try fewer words, or turn on a layer
              below and look.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((result, i) => {
                // A place name belongs to no layer, so it gets the plain pip
                // rather than borrowing another layer's colour and meaning.
                const layer = result.layer ? LAYER_BY_ID[result.layer] : null;
                return (
                  /* `searchMap` guarantees one row per layer and name, which is
                     a stabler key than the feed's ids — it gives two factions'
                     view of one door the same one. */
                  <li key={`${result.layer ?? "place"}|${result.title}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === cursor}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--panel-2)]"
                      style={i === cursor ? { background: "var(--panel-2)" } : undefined}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => pick(result)}
                    >
                      <span
                        className="mt-px flex-none"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{
                          __html: swatchSvg(
                            layer?.shape ?? "dot",
                            layer?.color ?? "var(--text-faint)",
                            15,
                          ),
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-medium">
                          {result.title}
                        </span>
                        <span
                          className="block truncate text-[0.7rem]"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {/* The floor is only worth saying when it isn't the
                              one you are already looking at. Customs puts every
                              marker on one unbounded ground band, so printing it
                              unconditionally wrote "· Ground level" down the
                              whole list and told nobody anything. */}
                          {[
                            result.subtitle,
                            result.floor && result.floor.id !== currentFloorId
                              ? result.floor.name
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
