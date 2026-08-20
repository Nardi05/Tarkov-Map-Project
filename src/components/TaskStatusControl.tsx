import type { TaskStatus } from "../types";
import { Icon, icons } from "./ui";

/**
 * The three-state control the whole task UI is built around: not started →
 * active → done. "Active" is the state that matters most here — it means the
 * task is in your in-game list right now, which is what the map draws.
 */
export default function TaskStatusControl({
  status,
  name,
  size = 20,
  onCycle,
}: {
  status: TaskStatus | undefined;
  name: string;
  size?: number;
  onCycle: () => void;
}) {
  const label =
    status === "completed"
      ? `${name}: done. Tap to reset.`
      : status === "active"
        ? `${name}: active. Tap to mark done.`
        : `${name}: not started. Tap to mark active.`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCycle}
      className="status-box status-pop tap-target"
      data-state={status ?? "none"}
      style={{ width: size, height: size }}
    >
      {status === "completed" ? (
        <Icon path={icons.check} size={Math.round(size * 0.62)} />
      ) : status === "active" ? (
        // A filled dot rather than a tick: active means "in progress", and a
        // tick here would read as finished at a glance.
        <span
          className="block rounded-full"
          style={{ width: size * 0.34, height: size * 0.34, background: "currentColor" }}
        />
      ) : null}
    </button>
  );
}
