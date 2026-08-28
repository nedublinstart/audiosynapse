"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorPanel, InlineAlert } from "@/components/InlineAlert";
import { SkeletonList } from "@/components/SkeletonList";
import { StatePlaceholder } from "@/components/StatePlaceholder";
import { api, type Lecture, type Subject } from "@/lib/api";
import { errorMessage, placeholderForError } from "@/lib/placeholders";
import { formatScheduleSlot } from "@/lib/schedule";
import { isAutoLectureTitle, suggestLectureTitle } from "@/lib/lectureTitles";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

function SubjectInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const subjectId = Number(params.id);
  const invalidId = !Number.isFinite(subjectId) || subjectId <= 0;
  const [subject, setSubject] = useState<Subject | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (invalidId) {
      setError("Некорректная ссылка на предмет");
      setLoaded(true);
      return;
    }
    const [s, l] = await Promise.all([
      api.getSubject(subjectId),
      api.listLectures(subjectId),
    ]);
    setSubject(s);
    setLectures(l);
    setLoadError(null);
    setLoaded(true);
    return l;
  }, [invalidId, subjectId]);

  useEffect(() => {
    void load().catch((e) => {
      setLoadError(e);
      setError(errorMessage(e, "Ошибка загрузки"));
      setLoaded(true);
    });
  }, [load]);

  useEffect(() => {
    if (!loaded || invalidId) return;
    if (searchParams.get("new") === "1") {
      setShowForm(true);
      setTitleTouched(false);
      setTitle(suggestLectureTitle(lectures.length));
      setTopic("");
      router.replace(`/app/subjects/${subjectId}`, { scroll: false });
    }
  }, [loaded, invalidId, lectures.length, router, searchParams, subjectId]);

  function openLectureForm(count = lectures.length) {
    setShowForm(true);
    setTitleTouched(false);
    setTitle(suggestLectureTitle(count));
    setTopic("");
  }

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
      setLoadError(err);
      setError(errorMessage(err, "Ошибка"));
      setBusy(false);
    }
  }

  async function onDeleteSubject() {
    if (!confirm("Удалить предмет и все лекции?")) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteSubject(subjectId);
      router.push("/app");
    } catch (err) {
      setLoadError(err);
      setError(errorMessage(err, "Не удалось удалить предмет"));
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <AppShell title="Предмет">
        <SkeletonList rows={4} />
      </AppShell>
    );
  }

  if (loadError && !subject) {
    const variant = invalidId ? "not-found" : placeholderForError(loadError);
    return (
      <AppShell title="Предмет">
        <ErrorPanel
          err={loadError}
          error={invalidId ? "Предмет не найден" : error}
          onRetry={
            invalidId
              ? undefined
              : () => {
                  setLoadError(null);
                  setError("");
                  setLoaded(false);
                  void load();
                }
          }
          compact={variant === "not-found"}
        />
      </AppShell>
    );
  }

  const autoTitle = isAutoLectureTitle(title, lectures.length) && !titleTouched;

  return (
    <AppShell title={subject ? subject.name : "Предмет"}>
      <FadeIn>
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
                {subject?.schedule_slots?.length ? (
                  <ul className="mt-3 space-y-1">
                    {subject.schedule_slots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        <CalendarDays size={12} style={{ color: "var(--accent)" }} />
                        {formatScheduleSlot(slot)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !min-h-10 !px-3" onClick={() => void onDeleteSubject()} aria-label="Удалить">
                <Trash2 size={16} />
              </button>
              <button
                className="btn-primary flex-1 sm:!w-auto"
                onClick={() => (showForm ? setShowForm(false) : openLectureForm())}
              >
                <Plus size={16} /> {showForm ? "Скрыть" : "Лекция"}
              </button>
            </div>
          </div>
        </div>
      </FadeIn>

      {showForm ? (
        <FadeIn>
          <form onSubmit={onCreate} className="panel-reveal panel mb-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <label className="label">Название</label>
              <input
                className={`input ${autoTitle ? "input-suggested" : ""}`}
                required
                placeholder={suggestLectureTitle(lectures.length)}
                value={title}
                onChange={(e) => {
                  setTitleTouched(true);
                  setTitle(e.target.value);
                }}
                autoFocus
              />
              {autoTitle ? (
                <p className="mt-1.5 text-xs" style={{ color: "var(--fg-muted)" }}>
                  Подставлено автоматически — можно изменить
                </p>
              ) : null}
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
            <p className="text-xs sm:col-span-2" style={{ color: "var(--fg-muted)" }}>
              Дата подставится сама (сегодня). После создания сразу откроется загрузка аудио.
            </p>
            <div className="sm:col-span-2">
              <button className="btn-primary sm:!w-auto" disabled={busy}>
                {busy ? "Создаём…" : "Создать и загрузить аудио"}
              </button>
            </div>
          </form>
        </FadeIn>
      ) : null}

      {error && subject ? (
        <InlineAlert
          error={error}
          err={loadError ?? undefined}
          networkStub
          onRetry={() => {
            setLoadError(null);
            setError("");
            void load();
          }}
        />
      ) : null}

      <div className="space-y-2.5">
        {lectures.map((lecture) => (
          <FadeIn key={lecture.id}>
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
          <FadeIn>
            <StatePlaceholder
              variant="empty-lectures"
              actions={[
                {
                  label: "Новая лекция",
                  onClick: () => openLectureForm(0),
                  primary: true,
                },
              ]}
            />
          </FadeIn>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function SubjectPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <AppShell title="Предмет">
            <SkeletonList rows={4} />
          </AppShell>
        }
      >
        <SubjectInner />
      </Suspense>
    </RequireAuth>
  );
}
