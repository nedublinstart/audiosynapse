import clsx from "clsx";
import type { LectureStatus } from "@/lib/api";

const LABELS: Record<LectureStatus, string> = {
  awaiting_audio: "Ожидает аудио",
  processing: "В обработке",
  ready: "Готова",
  needs_clarification: "Уточнение",
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
        "status-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium tracking-wide",
        className
      )}
      style={{
        background: `color-mix(in srgb, ${COLORS[status]} 16%, transparent)`,
        color: COLORS[status],
        border: `1px solid color-mix(in srgb, ${COLORS[status]} 28%, transparent)`,
      }}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full", status === "processing" && "processing-dot")}
        style={{ background: COLORS[status] }}
      />
      {LABELS[status]}
    </span>
  );
}

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
