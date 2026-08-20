import type { CSSProperties } from "react";
import { MODE_META, MODE_ORDER } from "../lib/mode";
import type { GameMode } from "../lib/persist-migrate";

export default function ModeSwitch({
  value,
  onChange,
  size = "md",
}: {
  value: GameMode;
  onChange: (mode: GameMode) => void;
  size?: "sm" | "md";
}) {
  const compact = size === "sm";
  const index = Math.max(0, MODE_ORDER.indexOf(value));
  return (
    <div
      className="segment"
      role="group"
      aria-label="Game mode"
      style={
        {
          "--segment-count": MODE_ORDER.length,
          "--segment-index": index,
        } as CSSProperties
      }
    >
      <span className="segment-pill" aria-hidden="true" />
      {MODE_ORDER.map((m) => (
        <button
          key={m}
          type="button"
          className="btn btn-ghost"
          style={{
            padding: compact ? "0.28rem 0.62rem" : "0.34rem 0.78rem",
            fontSize: compact ? "0.7rem" : "0.75rem",
          }}
          aria-pressed={value === m}
          title={MODE_META[m].hint}
          onClick={() => onChange(m)}
        >
          {compact ? MODE_META[m].short : MODE_META[m].label}
        </button>
      ))}
    </div>
  );
}
