import { useMemo, useState } from "react";
import { useProgression } from "../lib/data";
import { TARGET_SHORTCUTS } from "../lib/plan";
import { displayName, visibleInMode } from "../lib/task-variant";
import { useStore } from "../store";

export default function TargetPicker({
  remaining,
  variant = "chips",
}: {
  remaining: number | null;
  variant?: "chips" | "bar";
}) {
  const progression = useProgression();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const data = progression.data;
  const current = profile.targetTaskId ? data?.tasks[profile.targetTaskId] : null;

  const shortcuts = TARGET_SHORTCUTS.filter((s) => data?.tasks[s.id]);

  const matches = useMemo(() => {
    if (!data || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(data.tasks)
      .filter(([, t]) => visibleInMode(t.name, profile.mode) && displayName(t.name).toLowerCase().includes(q))
      .slice(0, 12)
      .map(([id, t]) => ({ id, name: displayName(t.name) }));
  }, [data, query, profile.mode]);

  const label = current ? displayName(current.name) : "No target";

  if (variant === "bar") {
    return (
      <div className="target-bar">
        <p className="raid-board-label">Target task</p>
        <select
          className="input"
          aria-label="Target task"
          value={profile.targetTaskId ?? ""}
          onChange={(e) => setProfile("targetTaskId", e.target.value || null)}
        >
          <option value="">Everything doable</option>
          {shortcuts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          {profile.targetTaskId &&
            !shortcuts.some((s) => s.id === profile.targetTaskId) &&
            current && <option value={profile.targetTaskId}>{label}</option>}
        </select>
        <p className="mt-1 text-[0.72rem] tabular-nums" style={{ color: "var(--text-faint)" }}>
          {current
            ? `${remaining ?? 0} task${remaining === 1 ? "" : "s"} remaining`
            : "Pick a goal to rank the plan"}
        </p>
        <button type="button" className="chip chip-button mt-1.5" onClick={() => setOpen((v) => !v)}>
          Search any task
        </button>
        {open && (
          <div className="surface mt-2 p-2">
            <input
              autoFocus
              className="input w-full"
              placeholder="Any task name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-auto">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--panel-2)]"
                      onClick={() => {
                        setProfile("targetTaskId", m.id);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="text-[0.72rem]" style={{ color: "var(--text-faint)" }}>
        {current
          ? remaining != null
            ? `${remaining} task${remaining === 1 ? "" : "s"} left on this path`
            : displayName(current.name)
          : "No target — the plan is everything currently doable."}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            className={profile.targetTaskId === s.id ? "chip chip-accent" : "chip chip-button"}
            onClick={() => setProfile("targetTaskId", profile.targetTaskId === s.id ? null : s.id)}
          >
            {s.label}
          </button>
        ))}
        <button type="button" className="chip chip-button" onClick={() => setOpen((v) => !v)}>
          Search…
        </button>
        {profile.targetTaskId && (
          <button type="button" className="chip chip-button" onClick={() => setProfile("targetTaskId", null)}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <div className="surface mt-2 p-2">
          <input
            autoFocus
            className="input w-full"
            placeholder="Any task name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-auto">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--panel-2)]"
                    onClick={() => {
                      setProfile("targetTaskId", m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
