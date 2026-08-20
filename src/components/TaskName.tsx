import { displayName, zoneChip } from "../lib/task-variant";

/** Task title with the mode suffix turned into a chip. */
export default function TaskName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const chip = zoneChip(name);
  return (
    <span className={`inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className ?? ""}`}>
      <span className="min-w-0">{displayName(name)}</span>
      {chip && (
        <span className={`chip flex-none ${chip.label === "Kord" ? "chip-season" : ""}`} title={chip.title}>
          {chip.label}
        </span>
      )}
    </span>
  );
}
