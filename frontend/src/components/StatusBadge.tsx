import clsx from "clsx";
import type { LectureStatus } from "@/lib/api";

const LABELS: Record<LectureStatus, string> = {
  awaiting_audio: "Ожидает аудио",
  processing: "В обработке",
  ready: "Готова",
  needs_clarification: "Требует уточнения",
};

const COLORS: Record<LectureStatus, string> = {
  awaiting_audio: "var(--awaiting)",
  processing: "var(--processing)",
  ready: "var(--ready)",
  needs_clarification: "var(--warn)",
};

export function StatusBadge({ status, className }: { status: LectureStatus; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        background: `color-mix(in srgb, ${COLORS[status]} 18%, transparent)`,
        color: COLORS[status],
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: COLORS[status] }}
      />
      {LABELS[status]}
    </span>
  );
}

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
