import L from "leaflet";
import type { MarkerShape } from "./layers";

/**
 * Markers are inline-SVG div icons: no image requests, crisp at any zoom, and
 * recolourable from one place. Each shape is drawn in a 24x24 box with a dark
 * outline so it stays readable over both the pale vector maps and the dark
 * satellite tiles.
 */

const GLYPHS: Record<MarkerShape, string> = {
  // Spawn point: a solid pip. Deliberately the quietest marker — there are
  // hundreds of them and they read as a field, not as individual pins.
  dot: `<circle cx="12" cy="12" r="6.5" fill="var(--mc)" stroke="rgba(6,10,15,.7)" stroke-width="2"/>
        <circle cx="12" cy="12" r="2.2" fill="#fff" fill-opacity=".9"/>`,

  skull: `<circle cx="12" cy="12" r="10" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
          <path d="M12 5.6c-3.5 0-5.9 2.3-5.9 5.4 0 1.9.9 3 1.9 3.7v1.8c0 .8.6 1.4 1.4 1.4h5.2c.8 0 1.4-.6 1.4-1.4v-1.8c1-.7 1.9-1.8 1.9-3.7 0-3.1-2.4-5.4-5.9-5.4Z" fill="#fff"/>
          <circle cx="9.7" cy="11.2" r="1.7" fill="var(--mc)"/>
          <circle cx="14.3" cy="11.2" r="1.7" fill="var(--mc)"/>
          <path d="M11 14.6h2v2.6h-2z" fill="var(--mc)"/>`,

  crosshair: `<circle cx="12" cy="12" r="8.6" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
              <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" stroke-width="1.6"/>
              <path d="M12 3.6v3.4M12 17v3.4M3.6 12h3.4M17 12h3.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="12" r="1.1" fill="#fff"/>`,

  // Extract: a doorway with an arrow leaving through it.
  exit: `<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="5" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
         <path d="M13.4 6.6H8.2c-.7 0-1.2.5-1.2 1.2v8.4c0 .7.5 1.2 1.2 1.2h5.2" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>
         <path d="M12.6 12h5.2m-2.2-2.6L18.4 12l-2.8 2.6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Transit: two chevrons, i.e. "keep going, into the next map".
  transit: `<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="5" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
            <path d="M7.4 8.2 11.2 12l-3.8 3.8M12.6 8.2 16.4 12l-3.8 3.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,

  key: `<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="5" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
        <circle cx="9.4" cy="9.6" r="3.1" fill="none" stroke="#1a1205" stroke-width="2"/>
        <path d="m11.6 11.8 5 5m-2.2-.6 1.5 1.5m-3.4-3.4 1.5 1.5" fill="none" stroke="#1a1205" stroke-width="2" stroke-linecap="round"/>`,

  // Quest: a diamond, the one shape nothing else uses.
  quest: `<path d="M12 1.6 22.4 12 12 22.4 1.6 12Z" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
          <path d="M12 7.2v6" stroke="#0b2415" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="12" cy="16.4" r="1.3" fill="#0b2415"/>`,

  switch: `<rect x="2.4" y="2.4" width="19.2" height="19.2" rx="5" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2"/>
           <rect x="6" y="13.4" width="12" height="4.4" rx="2.2" fill="#062033"/>
           <circle cx="15.8" cy="15.6" r="1.5" fill="var(--mc)"/>
           <path d="M12 6.2v5" stroke="#062033" stroke-width="2.2" stroke-linecap="round"/>`,

  hazard: `<path d="M12 2.2 22.6 20.6H1.4Z" fill="var(--mc)" stroke="rgba(6,10,15,.75)" stroke-width="2" stroke-linejoin="round"/>
           <path d="M12 9v5" stroke="#2b0710" stroke-width="2.2" stroke-linecap="round"/>
           <circle cx="12" cy="17.5" r="1.3" fill="#2b0710"/>`,
};

/** Pip markers stay small; symbol markers need room for their glyph. */
const BASE_SIZE: Record<MarkerShape, number> = {
  dot: 15,
  skull: 27,
  crosshair: 24,
  exit: 26,
  transit: 26,
  key: 22,
  quest: 24,
  switch: 22,
  hazard: 24,
};

export function markerSvg(shape: MarkerShape, color: string, size: number): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="--mc:${color}" aria-hidden="true">${GLYPHS[shape]}</svg>`;
}

export interface IconOptions {
  shape: MarkerShape;
  color: string;
  /** User-controlled multiplier from settings. */
  scale: number;
  /** Short text drawn beside the marker, when labels are enabled. */
  label?: string | null;
  /** Higher wins when two labels collide. See declutterLabels(). */
  labelPriority?: number;
  /** Renders the "already handled" treatment (dimmed + check). */
  done?: boolean;
}

const iconCache = new Map<string, L.DivIcon>();

export function markerIcon({ shape, color, scale, label, labelPriority = 0, done }: IconOptions): L.DivIcon {
  const cacheKey = `${shape}|${color}|${scale}|${label ?? ""}|${labelPriority}|${done ? 1 : 0}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const size = Math.round(BASE_SIZE[shape] * scale);
  const text = label
    ? `<span class="marker-label" data-priority="${labelPriority}">${label.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)}</span>`
    : "";
  const check = done
    ? `<svg class="marker-check" viewBox="0 0 24 24" width="${Math.round(size * 0.55)}" height="${Math.round(size * 0.55)}"><circle cx="12" cy="12" r="11" fill="#0f1720" stroke="#22c55e" stroke-width="2.5"/><path d="m6.6 12.4 3.6 3.6 7.2-8" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : "";

  const icon = L.divIcon({
    className: `tk-marker${done ? " is-done" : ""}`,
    html: `<span class="marker-shape">${markerSvg(shape, color, size)}${check}</span>${text}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  // Icons are shared by thousands of markers; a bounded cache keeps churn down.
  if (iconCache.size > 400) iconCache.clear();
  iconCache.set(cacheKey, icon);
  return icon;
}

/** Legend/panel swatch — same artwork as the map, at text size. */
export function swatchSvg(shape: MarkerShape, color: string, size = 18): string {
  return markerSvg(shape, color, size);
}
