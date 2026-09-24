import { LAYERS } from "../lib/layers";
import { swatchSvg } from "../lib/marker-icons";
import { Card, Term } from "./ui";

/**
 * The map's vocabulary, in one card.
 *
 * Colour says *who*, shape says *what* — the single rule that makes every map
 * on the site readable. It was previously hidden inside a collapsed `details`
 * at the bottom of the map list, which is the last place somebody who needs it
 * would look.
 */
const PRIMER_LAYERS = [
  "pmc-spawns",
  "scav-spawns",
  "pmc-extracts",
  "transits",
  "quests",
  "keys",
  "boss-spawns",
  "hazards",
];

export function MapLegend({ limit = 6 }: { limit?: number }) {
  const items = PRIMER_LAYERS.slice(0, limit)
    .map((id) => LAYERS.find((l) => l.id === id))
    .filter((l): l is (typeof LAYERS)[number] => Boolean(l));

  return (
    <ul className="legend">
      {items.map((layer) => (
        <li key={layer.id} className="legend-item">
          <span
            className="mt-0.5 flex-none"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: swatchSvg(layer.shape, layer.color, 20) }}
          />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium">{layer.label}</p>
            <p className="mt-0.5 text-[0.72rem] leading-snug faint">{layer.hint}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The legend wrapped in its explanation, for the maps page. */
export function MapPrimer() {
  return (
    <Card
      title="How to read a map"
      hint={
        <>
          Colour is <em>who</em> it belongs to. Shape is <em>what</em> it is — so a blue square is
          a <Term id="pmc" /> <Term id="extract">extract</Term> on every map on the site.
        </>
      }
    >
      <MapLegend limit={8} />
    </Card>
  );
}
