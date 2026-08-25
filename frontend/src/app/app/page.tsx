"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, CalendarClock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
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
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [s, sug] = await Promise.all([api.listSubjects(), api.suggestions()]);
    setSubjects(s);
    setSuggestions(sug);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
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
        <FadeIn>
          <section className="panel mb-6 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <CalendarClock size={16} style={{ color: "var(--accent)" }} />
              После пары можно создать карточку лекции
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={`${s.subject_id}-${s.end_time}`}
                  className="flex flex-col gap-3 rounded-[10px] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  style={{ background: "var(--bg-soft)" }}
                >
                  <div className="text-sm">
                    <div className="font-medium">{s.subject_name}</div>
                    <div style={{ color: "var(--fg-muted)" }}>
                      {WEEKDAYS[s.weekday]} · {s.start_time}–{s.end_time}
                      {s.location ? ` · ${s.location}` : ""}
                    </div>
                  </div>
                  <button className="btn-primary sm:!w-auto" onClick={() => void acceptSuggestion(s)}>
                    Создать лекцию
                  </button>
                </div>
              ))}
            </div>
          </section>
        </FadeIn>
      ) : null}

      <FadeIn delay={60}>
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="page-title text-2xl sm:text-3xl">Предметы</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
              Всё по полочкам — без лишнего шума
            </p>
          </div>
          <button className="btn-primary !min-h-10 shrink-0 !px-3 sm:!w-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Предмет</span>
          </button>
        </div>
      </FadeIn>

      {showForm ? (
        <FadeIn>
          <form onSubmit={onCreate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
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
              <button className="btn-primary sm:!w-auto" disabled={busy}>
                {busy ? "Сохраняем…" : "Создать предмет"}
              </button>
            </div>
          </form>
        </FadeIn>
      ) : null}

      {!loaded ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel h-32 p-4">
              <div className="skeleton mb-3 h-4 w-1/2" />
              <div className="skeleton mb-2 h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Link
              key={subject.id}
              href={`/app/subjects/${subject.id}`}
              className="panel panel-interactive block p-4 sm:p-5"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: subject.color }}
                />
                <h3 className="font-medium tracking-tight">{subject.name}</h3>
              </div>
              <p className="mb-4 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                {subject.description || "Без описания"}
              </p>
              <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--fg-muted)" }}>
                <span>
                  {subject.lecture_count}{" "}
                  {subject.lecture_count === 1 ? "лекция" : "лекций"}
                </span>
                <span className="truncate text-right">
                  {subject.schedule_slots.length
                    ? subject.schedule_slots
                        .map((s) => `${WEEKDAYS[s.weekday]} ${s.start_time}`)
                        .join(", ")
                    : "Без расписания"}
                </span>
              </div>
            </Link>
          ))}
          {!subjects.length ? (
            <div
              className="panel p-6 text-sm sm:col-span-2 lg:col-span-3"
              style={{ color: "var(--fg-muted)" }}
            >
              Пока пусто. Создайте первый предмет — например, «Философия».
            </div>
          ) : null}
        </div>
      )}
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
