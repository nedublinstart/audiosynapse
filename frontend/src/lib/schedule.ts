/** Weekday helpers — 0=Mon … 6=Sun (matches backend ScheduleSlot). */

export const WEEKDAYS = [
  { value: 0, short: "Пн", label: "Понедельник" },
  { value: 1, short: "Вт", label: "Вторник" },
  { value: 2, short: "Ср", label: "Среда" },
  { value: 3, short: "Чт", label: "Четверг" },
  { value: 4, short: "Пт", label: "Пятница" },
  { value: 5, short: "Сб", label: "Суббота" },
  { value: 6, short: "Вс", label: "Воскресенье" },
] as const;

export type ScheduleSlotDraft = {
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
};

export function weekdayLabel(weekday: number, short = true): string {
  const row = WEEKDAYS.find((d) => d.value === weekday);
  if (!row) return "?";
  return short ? row.short : row.label;
}

export function formatScheduleSlot(slot: ScheduleSlotDraft): string {
  const day = weekdayLabel(slot.weekday);
  const loc = slot.location ? ` · ${slot.location}` : "";
  return `${day} ${slot.start_time}–${slot.end_time}${loc}`;
}

export function emptySlot(): ScheduleSlotDraft {
  return { weekday: 0, start_time: "09:00", end_time: "10:30", location: null };
}

export const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov", ".3gp", ".avi", ".m4v"];

export function isVideoFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
