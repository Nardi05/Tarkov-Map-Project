import type { ReactNode } from "react";
import { href, onNavClick } from "../lib/router";
import { useStore } from "../store";
import ModeSwitch from "./ModeSwitch";
import { Icon, icons, SearchButton, SiteNav, TabBar, Wordmark } from "./ui";

/**
 * The frame for pages that are not one of the five sections — Settings and
 * the setup walkthrough.
 *
 * Same top bar and phone tab bar as the rest of the site, so jumping to a map
 * or the dashboard does not mean finding the browser back button first.
 */
export default function PageShell({
  back = { to: href.dashboard(), label: "Dashboard" },
  aside,
  width = "narrow",
  children,
}: {
  back?: { to: string; label: string } | null;
  /** Extra item in the tool cluster — a step counter, a save state. */
  aside?: ReactNode;
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);

  return (
    <div className="page flex h-full flex-col">
      <header className="app-bar">
        <div className="app-bar-inner">
          <Wordmark />
          <SiteNav />
          <div className="app-bar-tools">
            {aside}
            <SearchButton />
            <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m)} size="sm" />
            <a
              href={href.settings()}
              onClick={onNavClick(href.settings())}
              className="btn btn-ghost btn-icon"
              aria-label="Settings and profiles"
              title="Settings"
            >
              <Icon path={icons.settings} size={17} />
            </a>
          </div>
        </div>
      </header>

      <div className="scroll-y min-h-0 flex-1">
        <div className="shell" style={width === "narrow" ? { maxWidth: "52rem" } : undefined}>
          {back && (
            <a className="crumb" href={back.to} onClick={onNavClick(back.to)}>
              <Icon path={icons.back} size={15} />
              {back.label}
            </a>
          )}
          {children}
        </div>
      </div>

      <TabBar />
    </div>
  );
}
