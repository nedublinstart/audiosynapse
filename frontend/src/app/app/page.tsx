"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import { BookOpen, CalendarClock, ChevronRight, Layers, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
import { WEEKDAYS } from "@/components/StatusBadge";
import { api, type ScheduleSuggestion, type Subject } from "@/lib/api";

function lectureLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лекций";
  if (mod10 === 1) return "лекция";
  if (mod10 >= 2 && mod10 <= 4) return "лекции";
  return "лекций";
}

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

  const totalLectures = subjects.reduce((sum, s) => sum + s.lecture_count, 0);

  return (
    <AppShell title="Учебный процесс">
      <FadeIn variant="fade-scale" duration={860}>
        <section className="dashboard-hero panel mb-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="label mb-2 !tracking-[0.12em]">Главное меню</p>
              <h2 className="page-title text-2xl sm:text-[2rem]">Учебный процесс</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed sm:text-[0.95rem]" style={{ color: "var(--fg-muted)" }}>
                Предметы, лекции и конспекты — всё в одном спокойном пространстве.
              </p>
            </div>
            {loaded ? (
              <div className="flex flex-wrap gap-2">
                <span className="stat-pill">
                  <Layers size={13} style={{ color: "var(--accent)" }} />
                  {subjects.length} {subjects.length === 1 ? "предмет" : "предметов"}
                </span>
                <span className="stat-pill">
                  <BookOpen size={13} style={{ color: "var(--accent)" }} />
                  {totalLectures} {lectureLabel(totalLectures)}
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="skeleton h-7 w-24 rounded-full" />
                <div className="skeleton h-7 w-28 rounded-full" />
              </div>
            )}
          </div>
        </section>
      </FadeIn>

      {suggestions.length > 0 ? (
        <FadeIn delay={70} variant="fade-up" duration={820}>
          <section className="panel mb-6 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <CalendarClock size={16} style={{ color: "var(--accent)" }} />
              После пары можно создать карточку лекции
            </div>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <FadeIn key={`${s.subject_id}-${s.end_time}`} delay={90 + i * 55} variant="fade-up">
                  <div
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
                </FadeIn>
              ))}
            </div>
          </section>
        </FadeIn>
      ) : null}

      <FadeIn delay={100} variant="fade-up">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h3 className="page-title text-xl sm:text-2xl">Предметы</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
              Всё по полочкам — без лишнего шума
            </p>
          </div>
          <button
            className="btn-primary !min-h-10 shrink-0 !px-3 sm:!w-auto"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">{showForm ? "Скрыть" : "Предмет"}</span>
          </button>
        </div>
      </FadeIn>

      {showForm ? (
        <FadeIn variant="fade-scale" duration={680}>
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
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <FadeIn key={i} delay={140 + i * 45} variant="fade-in" duration={620}>
              <div className="panel h-[9.5rem] p-4 sm:p-5">
                <div className="skeleton mb-3 h-4 w-1/2" />
                <div className="skeleton mb-2 h-3 w-full" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            </FadeIn>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject, i) => (
            <FadeIn key={subject.id} delay={120 + i * 65} variant="fade-scale" duration={820}>
              <Link
                href={`/app/subjects/${subject.id}`}
                className="subject-card panel panel-interactive block h-full p-4 sm:p-5"
                style={{ "--subject-accent": subject.color } as CSSProperties}
              >
                <span className="subject-card-glow" aria-hidden />
                <div className="relative mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: subject.color,
                        boxShadow: `0 0 0 2px color-mix(in srgb, ${subject.color} 35%, transparent)`,
                      }}
                    />
                    <h3 className="truncate font-medium tracking-tight">{subject.name}</h3>
                  </div>
                  <ChevronRight
                    size={16}
                    className="subject-card-arrow shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                </div>
                <p
                  className="relative mb-4 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {subject.description || "Без описания"}
                </p>
                <div
                  className="relative flex items-center justify-between gap-2 border-t pt-3 text-xs"
                  style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)", color: "var(--fg-muted)" }}
                >
                  <span className="font-medium" style={{ color: "var(--fg)" }}>
                    {subject.lecture_count} {lectureLabel(subject.lecture_count)}
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
            </FadeIn>
          ))}
          {!subjects.length ? (
            <FadeIn delay={160} variant="fade-scale" className="sm:col-span-2 lg:col-span-3">
              <div
                className="panel flex flex-col items-center justify-center px-6 py-12 text-center sm:py-14"
                style={{ color: "var(--fg-muted)" }}
              >
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                  }}
                >
                  <BookOpen size={22} />
                </div>
                <p className="mb-1 text-base font-medium" style={{ color: "var(--fg)" }}>
                  Пока пусто
                </p>
                <p className="max-w-sm text-sm leading-relaxed">
                  Создайте первый предмет — например, «Философия» — и загрузите аудио лекции.
                </p>
                <button
                  type="button"
                  className="btn-primary mt-5 sm:!w-auto"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={16} /> Добавить предмет
                </button>
              </div>
            </FadeIn>
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
