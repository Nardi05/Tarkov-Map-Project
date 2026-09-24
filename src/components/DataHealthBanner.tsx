import { useState } from "react";
import { useDataHealth, useDataRefresh } from "../lib/data";
import { Icon, icons } from "./ui";

/**
 * Says so when the game data on screen is not today's live build.
 *
 * Before this, a failed rebuild fell back to a snapshot and the page looked
 * exactly as healthy as ever — a player could plan a raid around last week's
 * quest graph with nothing on screen to suggest it. The footer line was the
 * only tell, and nobody reads footers.
 *
 * Dismissing hides this warning for the rest of the visit; a different
 * warning, or the same one after a reload, shows again.
 */
const dismissed = new Set<string>();

export default function DataHealthBanner({ compact = false }: { compact?: boolean }) {
  const health = useDataHealth();
  const { refreshing, refresh } = useDataRefresh();
  const [, force] = useState(0);

  if (health.level === "ok" || dismissed.has(health.title)) return null;

  return (
    <div className={compact ? "health-banner health-banner-compact" : "health-banner"} role="status">
      <span className="health-banner-icon" aria-hidden="true">
        <Icon path={icons.info} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{health.title}</p>
        {health.detail && !compact && <p className="health-banner-detail">{health.detail}</p>}
      </div>
      <button type="button" className="btn btn-sm flex-none" onClick={refresh} disabled={refreshing}>
        <Icon path={icons.refresh} size={13} />
        {refreshing ? "Checking…" : "Retry"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon flex-none"
        aria-label="Dismiss for this visit"
        title="Dismiss for this visit"
        onClick={() => {
          dismissed.add(health.title);
          force((n) => n + 1);
        }}
      >
        <Icon path={icons.close} size={14} />
      </button>
    </div>
  );
}
