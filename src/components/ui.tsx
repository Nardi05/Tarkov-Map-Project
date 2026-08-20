import type { ReactNode } from "react";
import { href, onNavClick } from "../lib/router";

/** Small shared pieces, kept here so the panels stay about their own logic. */

export function Toggle({
  checked,
  onChange,
  color,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  color?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="switch"
      data-on={checked}
      style={color ? ({ "--sw-color": color } as React.CSSProperties) : undefined}
    />
  );
}

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-3 py-3">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="eyebrow" style={{ color: "var(--text-dim)", letterSpacing: "0.12em" }}>
            {title}
          </h3>
          {hint && (
            <p className="mt-0.5 text-[0.7rem] leading-snug" style={{ color: "var(--text-faint)" }}>
              {hint}
            </p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export const icons = {
  layers: "m12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5",
  tasks: "M9 5h10M9 12h10M9 19h10M4 5l1.5 1.5L8 4M4 12l1.5 1.5L8 11M4 19l1.5 1.5L8 18",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.13-1.4l2.1-1.6-2-3.5-2.5 1a8 8 0 0 0-2.4-1.4L14.7 2h-4l-.37 2.7a8 8 0 0 0-2.4 1.4l-2.5-1-2 3.5 2.1 1.6a8.2 8.2 0 0 0 0 2.8l-2.1 1.6 2 3.5 2.5-1a8 8 0 0 0 2.4 1.4l.37 2.7h4l.37-2.7a8 8 0 0 0 2.4-1.4l2.5 1 2-3.5-2.1-1.6c.09-.46.13-.93.13-1.4Z",
  close: "M18 6 6 18M6 6l12 12",
  back: "m14 6-6 6 6 6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-8.5v.5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  external: "M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4",
  check: "m5 13 4 4L19 7",
  chevron: "m6 9 6 6 6-6",
  reset: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  stack: "M4 7h16M4 12h16M4 17h16",
  expand: "M9 3H3v6M3 3l7 7M15 21h6v-6M21 21l-7-7",
  collapse: "M9 3H3v6M3 3l7 7M15 21v-6h6M21 21l-7-7",
  fit: "M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3",
  /* Dashboard editing. `grip` is the drag handle; `wide`/`narrow` show what a
     press will do next, not what the panel currently is. */
  layout: "M4 5h16v14H4zM4 10h16M12 10v9",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  wide: "M4 6h16v12H4zM9 10l-2 2 2 2M15 10l2 2-2 2",
  narrow: "M4 6h16v12H4zM12 6v12M8 10l2 2-2 2M16 10l-2 2 2 2",
  eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  keyboard: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 4h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10",
};

export function Tick({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      className="tick tap-target"
      data-on={checked}
    >
      <Icon path={icons.check} size={11} />
    </button>
  );
}

export function EmptyState({
  title,
  hint,
  compact,
}: {
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-0.5 py-1.5" : "px-3 py-10 text-center"}>
      <p className={compact ? "text-[0.78rem]" : "text-sm font-semibold"}>{title}</p>
      {hint && (
        <p
          className={
            compact
              ? "mt-0.5 text-[0.7rem] leading-snug"
              : "mx-auto mt-2 max-w-[32ch] text-xs leading-relaxed"
          }
          style={{ color: "var(--text-faint)" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function Wordmark({ href: to = href.dashboard() }: { href?: string } = {}) {
  return (
    <a className="wordmark" href={to} onClick={onNavClick(to)} aria-label="Tarkov Maps home">
      <span className="wordmark-mark" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M8 1.5 14.5 14H1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="8" cy="10.2" r="1.35" fill="currentColor" />
        </svg>
      </span>
      <span className="wordmark-name">Tarkov Maps</span>
    </a>
  );
}

export function SiteNav({ current }: { current: "dashboard" | "maps" | "quests" }) {
  const item = (id: "dashboard" | "maps" | "quests", label: string, to: string) =>
    current === id ? (
      <span className="is-active" aria-current="page">
        {label}
      </span>
    ) : (
      <a href={to} onClick={onNavClick(to)}>
        {label}
      </a>
    );

  return (
    <nav className="site-nav" data-current={current} aria-label="Sections">
      <span className="site-nav-pill" aria-hidden="true" />
      {item("dashboard", "Dashboard", href.dashboard())}
      {item("maps", "Maps", href.maps())}
      {item("quests", "Quests", href.quests())}
    </nav>
  );
}

export function PageChrome({
  current,
  children,
}: {
  current: "dashboard" | "maps" | "quests";
  children?: ReactNode;
}) {
  return (
    <header className="page-chrome">
      <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
        <Wordmark />
        <SiteNav current={current} />
      </div>
      {children}
    </header>
  );
}
