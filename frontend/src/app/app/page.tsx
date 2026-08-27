"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { BookOpen, ChevronRight, Layers, Plus, Sparkles, Wand2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SubjectComposer } from "@/components/SubjectComposer";
import { SubjectImportMaster } from "@/components/SubjectImportMaster";
import { NetworkStub } from "@/components/NetworkStub";
import { TextReveal } from "@/components/TextReveal";
import { api, isNetworkError, networkErrorVariant, type CalendarLecture, type Subject } from "@/lib/api";

function subjectLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "предметов";
  if (mod10 === 1) return "предмет";
  if (mod10 >= 2 && mod10 <= 4) return "предмета";
  return "предметов";
}

function lectureLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лекций";
  if (mod10 === 1) return "лекция";
  if (mod10 >= 2 && mod10 <= 4) return "лекции";
  return "лекций";
}

function DashboardInner() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [calendarLectures, setCalendarLectures] = useState<CalendarLecture[]>([]);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [calLoading, setCalLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "create" | "import">("none");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadSubjects = useCallback(async () => {
    const s = await api.listSubjects();
    setSubjects(s);
    setLoaded(true);
  }, []);

  const loadCalendar = useCallback(async (month: Date) => {
    setCalLoading(true);
    try {
      const rows = await api.calendar(month.getFullYear(), month.getMonth() + 1);
      setCalendarLectures(rows);
    } finally {
      setCalLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubjects().catch((e) => {
      setLoadError(e);
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setLoaded(true);
    });
  }, [loadSubjects]);

  useEffect(() => {
    void loadCalendar(calMonth).catch((e) => {
      setLoadError(e);
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setCalLoading(false);
    });
  }, [calMonth, loadCalendar]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const totalLectures = subjects.reduce((sum, s) => sum + s.lecture_count, 0);

  return (
    <AppShell title="Учебный процесс">
      <FadeIn>
        <section className="dashboard-hero panel mb-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="label mb-2 !tracking-[0.12em]">Главное меню</p>
              <h2 className="page-title text-2xl sm:text-[2rem]">Учебный процесс</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed sm:text-[0.95rem]" style={{ color: "var(--fg-muted)" }}>
                Предмет → лекция → аудио → конспект. Без стабильного расписания и без ввода времени.
              </p>
            </div>
            {loaded ? (
              <div className="flex flex-wrap gap-2">
                <span className="stat-pill">
                  <Layers size={13} style={{ color: "var(--accent)" }} />
                  {subjects.length} {subjectLabel(subjects.length)}
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

      {toast ? (
        <div
          className="mb-4 animate-toast rounded-[10px] px-4 py-3 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {toast}
        </div>
      ) : null}

      {loadError && isNetworkError(loadError) ? (
        <div className="mb-4">
          <NetworkStub
            variant={networkErrorVariant(loadError)}
            compact
            onRetry={() => {
              setLoadError(null);
              setError("");
              void loadSubjects();
              void loadCalendar(calMonth);
            }}
          />
        </div>
      ) : error ? (
        <TextReveal contentKey={error}>
          <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        </TextReveal>
      ) : null}

      <FadeIn>
        <div className="mb-6">
          <MonthCalendar
            lectures={calendarLectures}
            month={calMonth}
            onMonthChange={setCalMonth}
            loading={calLoading}
          />
        </div>
      </FadeIn>

      <FadeIn>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="page-title text-xl sm:text-2xl">Предметы</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--fg-muted)" }}>
              Один предмет или импорт списком — расписание не спрашиваем
            </p>
          </div>
          {mode === "none" ? (
            <div className="flex gap-2">
              <button
                className="btn-outline !min-h-10 shrink-0 !px-3 sm:!w-auto"
                onClick={() => setMode("import")}
              >
                <Wand2 size={16} />
                <span className="hidden sm:inline">Импорт</span>
              </button>
              <button
                className="btn-primary !min-h-10 shrink-0 !px-3 sm:!w-auto"
                onClick={() => setMode("create")}
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Предмет</span>
              </button>
            </div>
          ) : null}
        </div>
      </FadeIn>

      {mode === "create" ? (
        <FadeIn>
          <SubjectComposer
            onCancel={() => setMode("none")}
            onCreated={(subject) => {
              setMode("none");
              setToast(`«${subject.name}» создан — можно добавлять лекции`);
              void loadSubjects();
              router.push(`/app/subjects/${subject.id}`);
            }}
          />
        </FadeIn>
      ) : null}

      {mode === "import" ? (
        <FadeIn>
          <SubjectImportMaster
            onCancel={() => setMode("none")}
            onImported={(created) => {
              setMode("none");
              setToast(
                created.length === 1
                  ? `«${created[0].name}» создан`
                  : `Добавлено предметов: ${created.length}`,
              );
              void loadSubjects();
            }}
          />
        </FadeIn>
      ) : null}

      {!loaded ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="panel h-[9.5rem] p-4 sm:p-5">
              <div className="skeleton mb-3 h-4 w-1/2" />
              <div className="skeleton mb-2 h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Link
              key={subject.id}
              href={`/app/subjects/${subject.id}`}
              className="subject-card panel block h-full p-4 sm:p-5"
              style={{ "--subject-accent": subject.color } as CSSProperties}
            >
              <div className="relative mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: subject.color,
                      boxShadow: `0 0 0 2px color-mix(in srgb, ${subject.color} 28%, transparent)`,
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
                {subject.description || "Можно сразу добавлять лекции"}
              </p>
              <div
                className="relative flex items-center justify-between gap-2 border-t pt-3 text-xs"
                style={{
                  borderColor: "color-mix(in srgb, var(--border) 65%, transparent)",
                  color: "var(--fg-muted)",
                }}
              >
                <span className="font-medium" style={{ color: "var(--fg)" }}>
                  {subject.lecture_count} {lectureLabel(subject.lecture_count)}
                </span>
                <span>Без расписания</span>
              </div>
            </Link>
          ))}
          {!subjects.length && mode === "none" ? (
            <div
              className="panel flex flex-col items-center justify-center px-6 py-12 text-center sm:col-span-2 sm:py-14 lg:col-span-3"
              style={{ color: "var(--fg-muted)" }}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                <Sparkles size={22} />
              </div>
              <p className="mb-1 text-base font-medium" style={{ color: "var(--fg)" }}>
                Начните с предметов
              </p>
              <p className="max-w-sm text-sm leading-relaxed">
                Добавьте один предмет или вставьте весь список — расписание и время не нужны.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-outline sm:!w-auto" onClick={() => setMode("import")}>
                  <Wand2 size={16} /> Импорт через ИИ
                </button>
                <button type="button" className="btn-primary sm:!w-auto" onClick={() => setMode("create")}>
                  <Plus size={16} /> Добавить предмет
                </button>
              </div>
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
