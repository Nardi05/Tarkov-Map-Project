import { useEffect, useRef, type ReactNode } from "react";
import { href, onNavClick, TAB_ORDER, type TabId } from "../lib/router";
import { useStore } from "../store";
import ModeSwitch from "./ModeSwitch";
import { Icon, icons, PageChrome } from "./ui";

/**
 * The frame the three tab pages — dashboard, maps, quests — share.
 *
 * It lives here, above the route switch, rather than inside each page, and
 * that placement is the whole point. When every page rendered its own copy,
 * changing tabs unmounted one nav and mounted another: the highlight pill was
 * created already sitting under the new tab, so the `transition: transform` it
 * carries never had two positions to move between and never played. Nothing
 * connected the page you left to the page you arrived at, which is what made
 * a tab change read as the whole thing resetting.
 *
 * Hoisted, the nav is the *same element* across the change. The pill slides
 * because it genuinely moves, and only the body below it is replaced.
 *
 * The slide is a CSS animation on the incoming body rather than a View
 * Transition. `startViewTransition` is not in every browser that will open
 * this site, and where it is, it snapshots the document the moment its
 * callback returns — while React has only *scheduled* the re-render, so the
 * transition captured the old page twice and the new one appeared, abruptly,
 * after the animation had finished. A keyed remount plus one keyframe is less
 * clever and works everywhere.
 */
export default function TabShell({
  current,
  children,
}: {
  current: TabId;
  children: ReactNode;
}) {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);

  const scroller = useRef<HTMLDivElement>(null);
  const previous = useRef<TabId | null>(null);

  /*
   * Which way the body travels: the direction you moved along the nav, so the
   * motion agrees with the pill rather than fighting it. Null on first paint —
   * arriving at a page is not a movement between two of them.
   */
  const from = previous.current == null ? null : TAB_ORDER[previous.current];
  const to = TAB_ORDER[current];
  const direction = from == null || from === to ? null : to > from ? "fwd" : "back";

  useEffect(() => {
    previous.current = current;
    // The scroll container now outlives the page inside it, so it keeps the
    // offset from the page you left unless it is told otherwise.
    scroller.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [current]);

  return (
    <div ref={scroller} className="page scroll-y h-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
        <PageChrome current={current}>
          <ModeSwitch value={profile.mode} onChange={(m) => setProfile("mode", m)} size="sm" />
          <a
            href={href.settings()}
            onClick={onNavClick(href.settings())}
            className="btn btn-ghost btn-icon"
            aria-label="Settings and profiles"
            title="Settings"
          >
            <Icon path={icons.settings} size={16} />
          </a>
        </PageChrome>

        {/* Keyed on the tab so React replaces the subtree, which is what
            restarts the animation. */}
        <div key={current} className="tab-body" data-slide={direction ?? undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
