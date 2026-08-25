"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, CalendarClock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { WEEKDAYS } from "@/components/StatusBadge";
import { api, type ScheduleSuggestion, type Subject } from "@/lib/api";

function DashboardInner() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, sug] = await Promise.all([api.listSubjects(), api.suggestions()]);
    setSubjects(s);
    setSuggestions(sug);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createSubject({
        name,
        description: description || undefined,
        schedule: [{ weekday, start_time: startTime, end_time: endTime, location: null }],
      });
      setName("");
      setDescription("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function acceptSuggestion(s: ScheduleSuggestion) {
    await api.createLecture(s.subject_id, { title: s.suggested_title, topic: s.subject_name });
    await load();
  }

  return (
    <AppShell title="Учебный процесс">
      {suggestions.length > 0 ? (
        <section className="panel mb-6 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CalendarClock size={16} style={{ color: "var(--accent)" }} />
            После пары можно создать карточку лекции
          </div>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={`${s.subject_id}-${s.end_time}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-soft)" }}
              >
                <div className="text-sm">
                  <div className="font-medium">{s.subject_name}</div>
                  <div style={{ color: "var(--fg-muted)" }}>
                    {WEEKDAYS[s.weekday]} · {s.start_time}–{s.end_time}
                    {s.location ? ` · ${s.location}` : ""}
                  </div>
                </div>
                <button className="btn-primary" onClick={() => void acceptSuggestion(s)}>
                  Создать лекцию
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Предметы
        </h2>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> Предмет
        </button>
      </div>

      {showForm ? (
        <form onSubmit={onCreate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Название</label>
            <input
              className="input"
              required
              placeholder="Высшая математика"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Описание</label>
            <input
              className="input"
              placeholder="Необязательно"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">День пары</label>
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
          <div className="grid grid-cols-2 gap-2">
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
          {error ? (
            <p className="sm:col-span-2 text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Создать предмет"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((subject) => (
          <Link
            key={subject.id}
            href={`/app/subjects/${subject.id}`}
            className="panel block p-4 transition hover:translate-y-[-1px]"
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: subject.color }}
              />
              <h3 className="font-medium">{subject.name}</h3>
            </div>
            <p className="mb-3 line-clamp-2 text-sm" style={{ color: "var(--fg-muted)" }}>
              {subject.description || "Без описания"}
            </p>
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--fg-muted)" }}>
              <span>{subject.lecture_count} лекций</span>
              <span>
                {subject.schedule_slots.length
                  ? subject.schedule_slots
                      .map((s) => `${WEEKDAYS[s.weekday]} ${s.start_time}`)
                      .join(", ")
                  : "Расписание не задано"}
              </span>
            </div>
          </Link>
        ))}
        {!subjects.length ? (
          <div className="panel p-6 text-sm sm:col-span-2 lg:col-span-3" style={{ color: "var(--fg-muted)" }}>
            Пока нет предметов. Создайте первый — например, «Философия» или «Высшая математика».
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function AppPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
