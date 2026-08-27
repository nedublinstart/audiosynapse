"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, BookOpen, CalendarPlus, ChevronRight, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
import { StatusBadge, WEEKDAYS } from "@/components/StatusBadge";
import { api, type Lecture, type Subject } from "@/lib/api";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

function SubjectInner() {
  const params = useParams();
  const router = useRouter();
  const subjectId = Number(params.id);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:30");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      api.getSubject(subjectId),
      api.listLectures(subjectId),
    ]);
    setSubject(s);
    setLectures(l);
    setLoaded(true);
  }, [subjectId]);

  useEffect(() => {
    void load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const lecture = await api.createLecture(subjectId, {
        title: title.trim(),
        topic: topic.trim() || undefined,
      });
      setTitle("");
      setTopic("");
      setShowForm(false);
      router.push(`/app/lectures/${lecture.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  }

  async function onAddSchedule(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.addSchedule(subjectId, {
        weekday,
        start_time: startTime,
        end_time: endTime,
        location: location.trim() || null,
      });
      setShowSchedule(false);
      setLocation("");
      setToast("Ориентир по расписанию добавлен");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteSubject() {
    if (!confirm("Удалить предмет и все лекции?")) return;
    await api.deleteSubject(subjectId);
    router.push("/app");
  }

  const slots = subject?.schedule_slots ?? [];

  return (
    <AppShell title={subject ? subject.name : "Предмет"}>
      <FadeIn variant="fade-scale">
        <div className="dashboard-hero panel mb-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Link href="/app" className="btn-ghost !min-h-10 shrink-0 !px-2.5" aria-label="Назад">
                <ArrowLeft size={18} />
              </Link>
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: subject?.color || "var(--accent)",
                      boxShadow: `0 0 0 2px color-mix(in srgb, ${subject?.color || "var(--accent)"} 35%, transparent)`,
                    }}
                  />
                  <h2 className="page-title truncate text-2xl sm:text-3xl">{subject?.name || "…"}</h2>
                </div>
                <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                  {subject?.description || "Лекции и конспекты по этому предмету"}
                </p>
                {loaded ? (
                  <p className="mt-2 text-xs" style={{ color: "var(--fg-muted)" }}>
                    {slots.length
                      ? slots
                          .map(
                            (s) =>
                              `${WEEKDAYS[s.weekday]} ${s.start_time}–${s.end_time}${
                                s.location ? ` · ${s.location}` : ""
                              }`,
                          )
                          .join(" · ")
                      : "Гибкое расписание — ориентир можно добавить позже"}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost !min-h-10 !px-3"
                onClick={() => {
                  setShowSchedule((v) => !v);
                  setShowForm(false);
                }}
                aria-label="Расписание"
                title="Ориентир по расписанию"
              >
                <CalendarPlus size={16} />
              </button>
              <button className="btn-ghost !min-h-10 !px-3" onClick={() => void onDeleteSubject()} aria-label="Удалить">
                <Trash2 size={16} />
              </button>
              <button
                className="btn-primary flex-1 sm:!w-auto"
                onClick={() => {
                  setShowForm((v) => !v);
                  setShowSchedule(false);
                }}
              >
                <Plus size={16} /> {showForm ? "Скрыть" : "Лекция"}
              </button>
            </div>
          </div>
        </div>
      </FadeIn>

      {toast ? (
        <div
          className="mb-4 animate-toast rounded-[10px] px-4 py-3 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {toast}
        </div>
      ) : null}

      {showSchedule ? (
        <FadeIn variant="fade-scale">
          <form onSubmit={onAddSchedule} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">Ориентир по расписанию</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                Не жёсткое расписание — просто подсказка, когда обычно бывает пара. Можно менять позже.
              </p>
            </div>
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
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-ghost sm:!w-auto"
                disabled={busy}
                onClick={() => setShowSchedule(false)}
              >
                Отмена
              </button>
              <button type="submit" className="btn-primary sm:!w-auto" disabled={busy}>
                {busy ? "Сохраняем…" : "Добавить ориентир"}
              </button>
            </div>
          </form>
        </FadeIn>
      ) : null}

      {showForm ? (
        <FadeIn variant="fade-scale">
          <form onSubmit={onCreate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <label className="label">Название</label>
              <input
                className="input"
                required
                placeholder="Лекция 3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Тема</label>
              <input
                className="input"
                placeholder="Необязательно — тема пары"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <button className="btn-primary sm:!w-auto" disabled={busy}>
                {busy ? "Создаём…" : "Создать и загрузить аудио"}
              </button>
            </div>
          </form>
        </FadeIn>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel h-20 p-4">
              <div className="skeleton mb-2 h-4 w-1/3" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {lectures.map((lecture, i) => (
            <FadeIn key={lecture.id} delay={80 + i * 55} variant="fade-up">
              <Link
                href={`/app/lectures/${lecture.id}`}
                className="subject-card panel panel-interactive flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ "--subject-accent": subject?.color || "var(--accent)" } as CSSProperties}
              >
                <div className="relative min-w-0">
                  <div className="font-medium tracking-tight">{lecture.title}</div>
                  <div className="mt-0.5 truncate text-sm" style={{ color: "var(--fg-muted)" }}>
                    {lecture.topic || "Тема не указана"}
                    {lecture.lecture_date
                      ? ` · ${format(new Date(lecture.lecture_date), "d MMMM yyyy", { locale: ru })}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <StatusBadge status={lecture.status} />
                  <ChevronRight size={16} className="subject-card-arrow" style={{ color: "var(--accent)" }} />
                </div>
              </Link>
            </FadeIn>
          ))}
          {!lectures.length ? (
            <FadeIn delay={120}>
              <div className="panel flex flex-col items-center px-6 py-12 text-center">
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <BookOpen size={22} />
                </div>
                <p className="mb-1 font-medium">Лекций пока нет</p>
                <p className="mb-5 max-w-sm text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  Создайте карточку лекции и загрузите аудио — Synapse соберёт развёрнутый конспект.
                </p>
                <button type="button" className="btn-primary sm:!w-auto" onClick={() => setShowForm(true)}>
                  <Plus size={16} /> Новая лекция
                </button>
              </div>
            </FadeIn>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

export default function SubjectPage() {
  return (
    <RequireAuth>
      <SubjectInner />
    </RequireAuth>
  );
}
