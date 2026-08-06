import type { ReactNode } from "react";

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
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--text-dim)" }}>
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
};

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-3 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && (
        <p className="mx-auto mt-1 max-w-[26ch] text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
