"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarLecture } from "@/lib/api";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Props = {
  lectures: CalendarLecture[];
  month: Date;
  onMonthChange: (next: Date) => void;
  loading?: boolean;
};

function dayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function lectureCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лекций";
  if (mod10 === 1) return "лекция";
  if (mod10 >= 2 && mod10 <= 4) return "лекции";
  return "лекций";
}

/** Square month calendar — lectures as colored dots, no clock times. */
export function MonthCalendar({ lectures, month, onMonthChange, loading }: Props) {
  const [selected, setSelected] = useState<Date | null>(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarLecture[]>();
    for (const lecture of lectures) {
      if (!lecture.lecture_date) continue;
      const key = format(new Date(lecture.lecture_date), "yyyy-MM-dd");
      const list = map.get(key) || [];
      list.push(lecture);
      map.set(key, list);
    }
    return map;
  }, [lectures]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const selectedKey = selected ? dayKey(selected) : null;
  const selectedLectures = selectedKey ? byDay.get(selectedKey) || [] : [];
  const today = new Date();

  return (
    <section className="panel overflow-hidden p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="page-title text-xl sm:text-2xl">Календарь</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
            Квадраты дней — лекции по дате, без времени
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost !min-h-9 !px-2"
            aria-label="Предыдущий месяц"
            onClick={() => onMonthChange(subMonths(month, 1))}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize">
            {format(month, "LLLL yyyy", { locale: ru })}
          </span>
          <button
            type="button"
            className="btn-ghost !min-h-9 !px-2"
            aria-label="Следующий месяц"
            onClick={() => onMonthChange(addMonths(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="month-cal-grid mb-2">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="month-cal-weekday">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = dayKey(day);
          const items = byDay.get(key) || [];
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const colors = [...new Set(items.map((i) => i.subject_color))].slice(0, 4);

          return (
            <button
              key={key}
              type="button"
              className="month-cal-cell"
              data-in-month={inMonth ? "1" : "0"}
              data-today={isToday ? "1" : "0"}
              data-selected={isSelected ? "1" : "0"}
              data-has={items.length ? "1" : "0"}
              onClick={() => setSelected(day)}
              aria-label={`${format(day, "d MMMM", { locale: ru })}${items.length ? `, ${items.length} ${lectureCountLabel(items.length)}` : ""}`}
            >
              <span className="month-cal-daynum">{format(day, "d")}</span>
              <span className="month-cal-dots" aria-hidden>
                {colors.map((c) => (
                  <span key={c} className="month-cal-dot" style={{ background: c }} />
                ))}
                {items.length > 4 ? <span className="month-cal-more">+</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-10 w-full rounded-[10px]" />
          <div className="skeleton h-10 w-2/3 rounded-[10px]" />
        </div>
      ) : selected ? (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>
            {format(selected, "d MMMM yyyy", { locale: ru })}
          </p>
          {selectedLectures.length ? (
            <ul className="space-y-1.5">
              {selectedLectures.map((lecture) => (
                <li key={lecture.id}>
                  <Link
                    href={`/app/lectures/${lecture.id}`}
                    className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition-colors hover:bg-[var(--bg-soft)]"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: lecture.subject_color }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{lecture.title}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--fg-muted)" }}>
                        {lecture.subject_name}
                        {lecture.topic ? ` · ${lecture.topic}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
              В этот день лекций нет
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
