import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { glossary } from "../lib/glossary";
import { href, onNavClick, TAB_ORDER, type TabId } from "../lib/router";

/**
 * The shared vocabulary of the interface.
 *
 * Everything in here is a shape the site uses more than once: a card, a
 * callout, a page header, the nav. Keeping them here rather than in the pages
 * is what stops five pages inventing five slightly different card headers,
 * which is how the previous build ended up with `style={{ color: "var(--
 * text-faint)" }}` written out two hundred times.
 */

/* --------------------------------------------------------------- iconography */

export function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export const icons = {
  layers: "m12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5",
  tasks: "M9 5h10M9 12h10M9 19h10M4 5l1.5 1.5L8 4M4 12l1.5 1.5L8 11M4 19l1.5 1.5L8 18",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.13-1.4l2.1-1.6-2-3.5-2.5 1a8 8 0 0 0-2.4-1.4L14.7 2h-4l-.37 2.7a8 8 0 0 0-2.4 1.4l-2.5-1-2 3.5 2.1 1.6a8.2 8.2 0 0 0 0 2.8l-2.1 1.6 2 3.5 2.5-1a8 8 0 0 0 2.4 1.4l.37 2.7h4l.37-2.7a8 8 0 0 0 2.4-1.4l2.5 1 2-3.5-2.1-1.6c.09-.46.13-.93.13-1.4Z",
  close: "M18 6 6 18M6 6l12 12",
  back: "m14 6-6 6 6 6",
  forward: "m10 6 6 6-6 6",
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
  /* One pane across the row. Pressed = the panel is full width. */
  paneFull: "M4 6h16v12H4z",
  eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  keyboard:
    "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 4h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10",
  pin: "M12 17v5M8 3h8l-1 7h3l-6 6-6-6h3L8 3z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z",
  /* Section nav. Each one has to read at 20px on a phone tab bar. */
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5.5-5.5 2 2-5.5 5.5-2Z",
  map: "m9 4 6 2 5-2v14l-5 2-6-2-5 2V6l5-2Zm0 0v14m6-12v14",
  home: "M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9",
  refresh: "M3 12a9 9 0 0 1 15.3-6.4L21 8M21 4v4h-4M21 12a9 9 0 0 1-15.3 6.4L3 16m0 4v-4h4",
  spark: "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.2-11.2A2.3 2.3 0 0 1 12 8.3c1.3 0 2.3.9 2.3 2.1 0 1.9-2.3 1.8-2.3 3.4M12 17h.01",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  bolt: "m13 2-8 12h6l-1 8 8-12h-6l1-8Z",
};

/** The icon each section carries in the nav and the phone tab bar. */
export const TAB_ICON: Record<TabId, string> = {
  dashboard: icons.compass,
  maps: icons.map,
  story: icons.book,
  quests: icons.tasks,
  hideout: icons.home,
};

const TAB_LABEL: Record<TabId, string> = {
  dashboard: "Dashboard",
  maps: "Maps",
  story: "Story",
  quests: "Quests",
  hideout: "Hideout",
};

const TAB_HREF: Record<TabId, string> = {
  dashboard: href.dashboard(),
  maps: href.maps(),
  story: href.story(),
  quests: href.quests(),
  hideout: href.hideout(),
};

const TABS = Object.keys(TAB_ORDER) as TabId[];

/* ------------------------------------------------------------------ controls */

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
      style={color ? ({ "--sw-color": color } as CSSProperties) : undefined}
    />
  );
}

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

/** A keyboard key, for the shortcut hints that make the palette discoverable. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-transparent"
      style={{
        width: size,
        height: size,
        borderTopColor: "var(--accent)",
        borderRightColor: "var(--accent)",
      }}
      aria-hidden="true"
    />
  );
}

/* ----------------------------------------------------------------- structure */

/**
 * A titled block of content. Most of the site is made of these.
 *
 * `title` is optional because a card is also useful as a plain container, and
 * making callers pass an empty string for that was worse than the branch.
 */
export function Card({
  title,
  hint,
  action,
  tight,
  className,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  tight?: boolean;
  className?: string;
  /** Optional: a card that is only a heading and an action is a valid card. */
  children?: ReactNode;
}) {
  return (
    <section className={`card${tight ? " card-tight" : ""}${className ? ` ${className}` : ""}`}>
      {(title || action) && (
        <header className={`card-head${children ? "" : " mb-0"}`}>
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {hint && <p className="card-sub">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A heading above a run of cards, with room for a control on the right. */
export function SectionHead({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {hint && <p className="card-sub">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The compact section used inside the map page's side panels, where vertical
 * space is scarce and the heading is a label rather than a title.
 */
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
          <h3 className="kicker">{title}</h3>
          {hint && <p className="mt-0.5 text-[0.7rem] leading-snug faint">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * One sentence of context that is not part of the data on screen.
 *
 * The tone carries meaning, so it is a prop rather than a class the caller
 * picks: an explanation styled as a warning teaches the wrong urgency.
 */
export function Callout({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "ok" | "danger";
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  const toneClass = tone === "neutral" ? "" : ` callout-${tone}`;
  return (
    <div className={`callout${toneClass}${className ? ` ${className}` : ""}`}>
      <span className="callout-icon">
        <Icon path={icon ?? icons.info} size={16} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A word from the game's vocabulary, with its definition one hover or tap away.
 *
 * Implemented as a button rather than `title=` because a native tooltip never
 * appears on a touch screen, and roughly half of this site's use is on a
 * phone — exactly the audience least likely to already know what FIR means.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const entry = glossary(id);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // An unknown id must not swallow its own text — that would silently delete
  // copy the moment a term is renamed.
  if (!entry) return <>{children ?? id}</>;

  return (
    <span ref={wrap} className="relative inline-block">
      <button
        type="button"
        className="term"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span id={popId} role="tooltip" className="term-pop">
          <b>{entry.term}</b>
          {entry.body}
        </span>
      )}
    </span>
  );
}

/** A numbered walkthrough. */
export function Steps({ items }: { items: { title: ReactNode; body?: ReactNode }[] }) {
  return (
    <ol className="steps">
      {items.map((item, i) => (
        <li key={i} className="step">
          <span className="step-n" aria-hidden="true">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[0.875rem] font-semibold leading-snug">{item.title}</p>
            {item.body && <p className="mt-1 text-meta">{item.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Nothing here yet — and, always, what to do about it.
 *
 * The `hint` is not decoration. An empty panel with no next step is the point
 * at which a new player closes the tab, so every one of these says where to go.
 */
export function EmptyState({
  title,
  hint,
  compact,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  compact?: boolean;
  icon?: string;
  action?: ReactNode;
}) {
  if (compact) {
    return (
      <div className="px-0.5 py-1.5">
        <p className="text-[0.78rem] font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-[0.7rem] leading-snug faint">{hint}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  return (
    <div className="empty">
      <span className="empty-mark">
        <Icon path={icon ?? icons.info} size={18} />
      </span>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------- chrome */

export function Wordmark({ href: to = href.root() }: { href?: string } = {}) {
  return (
    <a className="wordmark" href={to} onClick={onNavClick(to)} aria-label="Tarkov Maps home">
      <span className="wordmark-mark" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path
            d="M8 1.5 14.5 14H1.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="10.2" r="1.35" fill="currentColor" />
        </svg>
      </span>
      <span className="wordmark-name">Tarkov Maps</span>
    </a>
  );
}

/**
 * The section nav.
 *
 * The sliding highlight gets its position from `--nav-index` rather than a
 * rule per section, so the row can grow without a stylesheet change. It only
 * animates because this element outlives the page change — see TabShell.
 */
export function SiteNav({ current }: { current: TabId }) {
  return (
    <nav
      className="site-nav"
      aria-label="Sections"
      style={
        {
          "--nav-count": TABS.length,
          "--nav-index": TAB_ORDER[current],
        } as CSSProperties
      }
    >
      <span className="site-nav-pill" aria-hidden="true" />
      {TABS.map((id) =>
        current === id ? (
          <span key={id} className="is-active" aria-current="page">
            <Icon path={TAB_ICON[id]} size={15} />
            {TAB_LABEL[id]}
          </span>
        ) : (
          <a key={id} href={TAB_HREF[id]} onClick={onNavClick(TAB_HREF[id])}>
            <Icon path={TAB_ICON[id]} size={15} />
            {TAB_LABEL[id]}
          </a>
        ),
      )}
    </nav>
  );
}

/**
 * The phone's navigation.
 *
 * A bottom bar, because the top of a 6" screen is not somewhere a thumb goes
 * and the five sections were previously crammed into a pill row that ran out
 * of width at 360px. Labels stay under the icons: icon-only bars test badly
 * with people who have not used the app before, which is the whole audience
 * this overhaul is for.
 */
export function TabBar({ current }: { current: TabId }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((id) => (
        <a
          key={id}
          href={TAB_HREF[id]}
          onClick={onNavClick(TAB_HREF[id])}
          aria-current={current === id ? "page" : undefined}
        >
          <Icon path={TAB_ICON[id]} size={19} />
          {TAB_LABEL[id]}
        </a>
      ))}
    </nav>
  );
}

/**
 * The command palette's visible affordance.
 *
 * The palette has been on ⌘K since it was built and nothing on screen said so,
 * which made the single fastest way around the site invisible to everyone who
 * had not read the source.
 */
export function SearchButton() {
  const open = () => {
    window.dispatchEvent(new CustomEvent("tk:palette"));
  };
  return (
    <>
      <button type="button" className="searchbtn" onClick={open}>
        <Icon path={icons.search} size={15} />
        Search maps, quests, items…
        <Kbd>⌘K</Kbd>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon xl:hidden"
        onClick={open}
        aria-label="Search"
        title="Search (⌘K)"
      >
        <Icon path={icons.search} size={17} />
      </button>
    </>
  );
}

/**
 * A small popover menu.
 *
 * The map page had eleven controls competing for the top bar, several of them
 * one-per-session ("fit the map", "hide the interface", "keyboard shortcuts").
 * Those move in here so the four things you actually touch mid-raid have room
 * to be legible. Nothing is removed — it is one press further away.
 */
export function Menu({
  label,
  icon,
  align = "end",
  children,
}: {
  label: string;
  icon?: string;
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative flex-none">
      <button
        type="button"
        className="btn btn-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon path={icon ?? icons.stack} size={16} />
      </button>
      {open && (
        <div className="menu-pop" data-align={align} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A row inside a `Menu`. Renders as a button or, with `to`, as a link. */
export function MenuItem({
  to,
  icon,
  hint,
  onClick,
  pressed,
  children,
}: {
  to?: string;
  icon?: string;
  hint?: string;
  onClick?: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      {icon && (
        <span className="flex-none faint">
          <Icon path={icon} size={15} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {hint && <span className="mt-0.5 block text-[0.68rem] faint">{hint}</span>}
      </span>
      {pressed && (
        <span className="flex-none" style={{ color: "var(--accent)" }}>
          <Icon path={icons.check} size={14} />
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <a className="menu-item" role="menuitem" href={to} onClick={onNavClick(to)}>
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

/** A labelled divider between groups of menu items. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="menu-label">{children}</p>;
}

/** A back-link to the section a detail page sits under. */
export function Crumb({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="crumb" href={to} onClick={onNavClick(to)}>
      <Icon path={icons.back} size={15} />
      {children}
    </a>
  );
}

/** Title + one-line purpose + optional actions. Same shape on every page. */
export function PageHeader({
  title,
  lead,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1 className="display text-[1.75rem] sm:text-[2.1rem]">{title}</h1>
        {lead && <p className="page-lead">{lead}</p>}
      </div>
      {children ? <div className="page-header-actions">{children}</div> : null}
    </header>
  );
}
