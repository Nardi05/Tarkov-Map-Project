import type { ReactNode } from "react";
import { href, onNavClick } from "../lib/router";
import { Icon, icons, Wordmark } from "./ui";

/**
 * The frame for the pages that are not one of the five sections — Settings and
 * the setup walkthrough.
 *
 * They used to render their own little header: a back arrow and a word. That
 * made them feel like they had left the site, and it left the sections
 * unreachable from either, so the only way back to the map you were looking at
 * was the browser's own button. Same bar as everywhere else, plus a back link,
 * fixes both.
 *
 * `width` is narrow by default because both pages are single columns of forms
 * and a form measured at 78rem is unreadable.
 */
export default function PageShell({
  back = { to: href.dashboard(), label: "Dashboard" },
  aside,
  width = "narrow",
  children,
}: {
  back?: { to: string; label: string } | null;
  /** Rendered at the right of the bar — a step counter, a save state. */
  aside?: ReactNode;
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  return (
    <div className="page flex h-full flex-col">
      <header className="app-bar">
        <div className="app-bar-inner">
          <Wordmark />
          {back && (
            <a className="crumb mb-0" href={back.to} onClick={onNavClick(back.to)}>
              <Icon path={icons.back} size={15} />
              {back.label}
            </a>
          )}
          {aside && <div className="app-bar-tools">{aside}</div>}
        </div>
      </header>

      <div className="scroll-y min-h-0 flex-1">
        <div className="shell" style={width === "narrow" ? { maxWidth: "52rem" } : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
