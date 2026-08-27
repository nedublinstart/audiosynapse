"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarPlus, Check, X } from "lucide-react";
import { WEEKDAYS } from "@/components/StatusBadge";
import { api, type Subject } from "@/lib/api";

const COLORS = [
  "#1f5c57",
  "#3a5570",
  "#8a6828",
  "#8f3a32",
  "#5c4a7a",
  "#2f6b4f",
  "#6a645c",
  "#1c4a6e",
];

type Props = {
  onCancel: () => void;
  onCreated: (subject: Subject) => void;
};

/**
 * Light subject composer — not a heavy wizard.
 * Step 1: essentials. Step 2: optional floating schedule (skippable).
 */
export function SubjectComposer({ onCancel, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [withSchedule, setWithSchedule] = useState(false);
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submit(includeSchedule: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название предмета");
      setStep(1);
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const subject = await api.createSubject({
        name: trimmed,
        description: description.trim() || undefined,
        color,
        schedule:
          includeSchedule && withSchedule
            ? [
                {
                  weekday,
                  start_time: startTime,
                  end_time: endTime,
                  location: location.trim() || null,
                },
              ]
            : [],
      });
      onCreated(subject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать предмет");
    } finally {
      setBusy(false);
    }
  }

  function onEssentials(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введите название предмета");
      return;
    }
    setError("");
    setStep(2);
  }

  return (
    <div className="panel mb-6 overflow-hidden p-0">
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p className="text-sm font-medium">Новый предмет</p>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {step === 1 ? "Название и цвет — остальное по желанию" : "Расписание необязательно"}
          </p>
        </div>
        <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-2 px-4 pt-4 sm:px-5">
        {[1, 2].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[0.7rem] font-semibold transition-all duration-300"
              style={{
                background: step === n ? "var(--accent)" : step > n ? "var(--accent-soft)" : "var(--bg-soft)",
                color: step === n ? "var(--accent-fg)" : step > n ? "var(--accent)" : "var(--fg-muted)",
              }}
            >
              {step > n ? <Check size={12} /> : n}
            </span>
            <span className="hidden text-xs sm:inline" style={{ color: step === n ? "var(--fg)" : "var(--fg-muted)" }}>
              {n === 1 ? "Суть" : "Расписание"}
            </span>
            {n === 1 ? (
              <span className="mx-1 hidden h-px w-6 sm:block" style={{ background: "var(--border)" }} />
            ) : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <form onSubmit={onEssentials} className="grid gap-4 p-4 sm:p-5">
          <div>
            <label className="label">Название</label>
            <input
              ref={nameRef}
              className="input"
              required
              placeholder="Например: Философия"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
          </div>
          <div>
            <label className="label">Заметка</label>
            <input
              className="input"
              placeholder="Необязательно — преподаватель, группа…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Цвет</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Цвет ${c}`}
                  className="h-8 w-8 rounded-full transition-transform duration-300 hover:scale-110"
                  style={{
                    background: c,
                    boxShadow:
                      color === c
                        ? `0 0 0 2px var(--bg-elevated), 0 0 0 4px ${c}`
                        : "0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)",
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost sm:!w-auto" onClick={onCancel}>
              Отмена
            </button>
            <button type="submit" className="btn-primary sm:!w-auto">
              Далее <ArrowRight size={16} />
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5">
          <div
            className="rounded-[12px] px-4 py-3 text-sm leading-relaxed"
            style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}
          >
            Расписание у студентов часто плавает. Можно создать предмет без слотов и добавить
            ориентир позже — или указать примерное время сейчас.
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-3"
            style={{ borderColor: withSchedule ? "color-mix(in srgb, var(--accent) 40%, var(--border))" : "var(--border)" }}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
              checked={withSchedule}
              onChange={(e) => setWithSchedule(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--fg)" }}>
                <CalendarPlus size={14} style={{ color: "var(--accent)" }} />
                Добавить ориентир по расписанию
              </span>
              <span className="mt-0.5 block text-xs" style={{ color: "var(--fg-muted)" }}>
                Не жёсткое расписание — просто подсказка «когда обычно бывает пара»
              </span>
            </span>
          </label>

          {withSchedule ? (
            <div className="animate-fade-up grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">День</label>
                <select
                  className="input"
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Аудитория</label>
                <input
                  className="input"
                  placeholder="Необязательно"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Начало</label>
                <input
                  className="input"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Конец</label>
                <input
                  className="input"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="btn-ghost sm:!w-auto" onClick={() => setStep(1)} disabled={busy}>
              Назад
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {withSchedule ? (
                <button
                  type="button"
                  className="btn-outline sm:!w-auto"
                  disabled={busy}
                  onClick={() => void submit(false)}
                >
                  {busy ? "Создаём…" : "Пропустить"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary sm:!w-auto"
                disabled={busy}
                onClick={() => void submit(true)}
              >
                {busy
                  ? "Создаём…"
                  : withSchedule
                    ? "Создать с ориентиром"
                    : "Создать без расписания"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
