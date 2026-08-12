import { useCallback, useEffect, useState } from "react";
import type { TaskImage } from "../types";
import { Icon, icons } from "./ui";

/**
 * The wiki serves full-resolution captures — one Streets overview is a 3.9MB
 * PNG — so always ask its CDN for a scaled copy instead. 640px fills the panel
 * for ~100KB; 1600px is plenty for the expanded view at ~470KB.
 *
 * Stored URLs look like `.../File.png/revision/latest?cb=…`, and the transform
 * slots in after `latest`. Anything not matching that is left alone.
 */
function scaled(url: string, width: number): string {
  const [base, query] = url.split("?");
  if (!base.includes("/revision/latest")) return url;
  return `${base.replace("/revision/latest", `/revision/latest/scale-to-width-down/${width}`)}${
    query ? `?${query}` : ""
  }`;
}

/**
 * The wiki's CDN refuses hotlinks by *Referer*, and it refuses them politely: a
 * request carrying one comes back 404 with a 300x171 "image not available"
 * JPEG. That is still a valid image, so `onError` never fires and the panel
 * quietly shows a grey placeholder where the screenshot should be.
 *
 * Sending no referrer at all is served the real file, so every <img> here sets
 * referrerPolicy="no-referrer". This threshold is the belt-and-braces half:
 * every cached image was at least this wide to begin with, so anything
 * narrower that arrives is the placeholder, and is reported as a failure.
 */
const MIN_REAL_WIDTH = 400;

/**
 * Wiki screenshots for one task, as a single-photo carousel.
 *
 * The point is finding a quest item that can spawn in a dozen places: the map
 * gets you to the building, and these get you to the shelf. Small by default
 * because the detail panel is narrow, and expandable to a full-screen overlay
 * because a 300px-wide screenshot of a dark room is useless.
 *
 * Images are hotlinked from the wiki's CDN rather than copied into the repo —
 * they are the wiki's to host, and this keeps the deploy free of a few hundred
 * megabytes of screenshots.
 */
export default function TaskGallery({ images, taskName }: { images: TaskImage[]; taskName: string }) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Nothing has loaded yet on a fresh task, so don't reserve space for a
  // picture that may turn out to be missing.
  const [broken, setBroken] = useState<Record<number, true>>({});
  const [loaded, setLoaded] = useState<Record<number, true>>({});

  const count = images.length;
  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  // Reset when the panel switches to a different task.
  useEffect(() => {
    setIndex(0);
    setExpanded(false);
    setBroken({});
    setLoaded({});
  }, [taskName]);

  /*
   * Warm the neighbours, then the blow-up copy of what you're looking at.
   *
   * Every one of these costs the wiki CDN's ~0.7s of connection setup no
   * matter how small the file is, and nothing was being fetched until the
   * moment you asked for it — so stepping through a gallery meant waiting
   * that out at every single click. Fetching ahead spends the same time
   * while you are still reading the current photo instead.
   *
   * The browser's own HTTP cache is what makes this pay off: these throwaway
   * Image objects put the bytes there, and the real <img> then renders from
   * cache. The full-size copy waits for the thumbnail so the picture actually
   * on screen is never competing with a prefetch for bandwidth.
   */
  useEffect(() => {
    if (count === 0) return;
    const warm: HTMLImageElement[] = [];
    const prefetch = (url: string) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = url;
      warm.push(img);
    };

    for (const delta of [1, -1]) {
      if (count < 2) break;
      prefetch(scaled(images[(index + delta + count) % count].url, 640));
    }

    let timer: number | undefined;
    if (loaded[index]) prefetch(scaled(images[index].url, 1600));
    else timer = window.setTimeout(() => prefetch(scaled(images[index].url, 1600)), 1200);

    return () => {
      window.clearTimeout(timer);
      // Dropping src cancels anything still in flight when you move on.
      for (const img of warm) img.src = "";
    };
  }, [index, count, images, loaded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      // Capture phase + stopPropagation so Escape closes the photo and nothing
      // else: the map page also listens for Escape to dismiss the whole detail
      // panel, and closing both at once loses your place.
      e.stopPropagation();
      if (e.key === "Escape") setExpanded(false);
      else if (e.key === "ArrowRight") step(1);
      else step(-1);
    };
    window.addEventListener("keydown", onKey, true);
    // The overlay covers the map, so stop the page behind it scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
    };
  }, [expanded, step]);

  if (count === 0) return null;

  const current = images[index];

  const arrows = (size: number) => (
    <>
      <button
        type="button"
        className="btn btn-icon absolute left-1.5 top-1/2 -translate-y-1/2"
        style={{ width: size, height: size, padding: 0 }}
        aria-label="Previous photo"
        onClick={(e) => {
          e.stopPropagation();
          step(-1);
        }}
      >
        <span style={{ transform: "rotate(90deg)", display: "block" }}>
          <Icon path={icons.chevron} size={Math.round(size * 0.55)} />
        </span>
      </button>
      <button
        type="button"
        className="btn btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
        style={{ width: size, height: size, padding: 0 }}
        aria-label="Next photo"
        onClick={(e) => {
          e.stopPropagation();
          step(1);
        }}
      >
        <span style={{ transform: "rotate(-90deg)", display: "block" }}>
          <Icon path={icons.chevron} size={Math.round(size * 0.55)} />
        </span>
      </button>
    </>
  );

  return (
    <div className="surface-2 overflow-hidden">
      <div
        className="relative cursor-zoom-in select-none"
        style={{ background: "var(--panel)" }}
        onClick={() => setExpanded(true)}
        role="button"
        tabIndex={0}
        aria-label={`Expand photo ${index + 1} of ${count}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(true);
          }
        }}
      >
        {broken[index] ? (
          <p className="px-2 py-6 text-center text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
            That photo could not be loaded.
          </p>
        ) : (
          <img
            src={scaled(current.url, 640)}
            alt={current.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="block w-full"
            style={{ aspectRatio: "16 / 9", objectFit: "cover" }}
            onError={() => setBroken((b) => ({ ...b, [index]: true }))}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth < MIN_REAL_WIDTH) {
                setBroken((b) => ({ ...b, [index]: true }));
              } else {
                setLoaded((l) => ({ ...l, [index]: true }));
              }
            }}
          />
        )}
        {/* Blank space for the better part of a second reads as broken, so say
            something is happening until the first paint of this photo. */}
        {!broken[index] && !loaded[index] && (
          <span
            className="pointer-events-none absolute inset-0 grid place-items-center"
            aria-hidden="true"
          >
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-transparent"
              style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
            />
          </span>
        )}
        {count > 1 && arrows(26)}
        <span
          className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] tabular-nums"
          style={{ background: "rgba(6,10,15,.72)", color: "#e6edf3" }}
        >
          <Icon path={icons.expand} size={11} />
          {index + 1} / {count}
        </span>
      </div>
      <p className="flex items-baseline gap-2 px-2 py-1 text-[0.65rem]" style={{ color: "var(--text-faint)" }}>
        <span className="min-w-0 flex-1 truncate" title={current.title}>
          {current.title}
        </span>
        <span className="flex-none">EFT wiki</span>
      </p>

      {expanded && (
        <div
          className="fixed inset-0 z-[2000] flex flex-col"
          style={{ background: "rgba(6,10,15,.94)" }}
          role="dialog"
          aria-modal="true"
          aria-label={`${taskName} photo ${index + 1} of ${count}`}
          onClick={() => setExpanded(false)}
        >
          <div className="flex flex-none items-center gap-2 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-[0.8rem]" style={{ color: "#e6edf3" }}>
              {taskName} — {current.title}
            </p>
            <span className="text-[0.72rem] tabular-nums" style={{ color: "#96a3b2" }}>
              {index + 1} / {count}
            </span>
            <button
              type="button"
              className="btn btn-icon"
              style={{ width: "1.9rem", height: "1.9rem", padding: 0 }}
              aria-label="Close photo"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              <Icon path={icons.close} size={14} />
            </button>
          </div>
          <div className="relative min-h-0 flex-1 cursor-zoom-out">
            <img
              src={scaled(current.url, 1600)}
              alt={current.title}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: "contain" }}
            />
            {count > 1 && arrows(40)}
          </div>
        </div>
      )}
    </div>
  );
}
