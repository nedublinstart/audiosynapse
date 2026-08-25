"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
import { StatusBadge } from "@/components/StatusBadge";
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
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      api.getSubject(subjectId),
      api.listLectures(subjectId),
    ]);
    setSubject(s);
    setLectures(l);
  }, [subjectId]);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const lecture = await api.createLecture(subjectId, {
        title,
        topic: topic || undefined,
      });
      setTitle("");
      setTopic("");
      setShowForm(false);
      router.push(`/app/lectures/${lecture.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function onDeleteSubject() {
    if (!confirm("Удалить предмет и все лекции?")) return;
    await api.deleteSubject(subjectId);
    router.push("/app");
  }

  return (
    <AppShell title={subject ? subject.name : "Предмет"}>
      <FadeIn>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 sm:items-center sm:gap-3">
            <Link href="/app" className="btn-ghost !min-h-10 shrink-0 !px-2.5" aria-label="Назад">
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Назад</span>
            </Link>
            <h2 className="page-title truncate text-2xl sm:text-3xl">
              {subject?.name || "…"}
            </h2>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost !min-h-10 !px-3" onClick={() => void onDeleteSubject()} aria-label="Удалить">
              <Trash2 size={16} />
            </button>
            <button className="btn-primary flex-1 sm:!w-auto" onClick={() => setShowForm((v) => !v)}>
              <Plus size={16} /> Лекция
            </button>
          </div>
        </div>
      </FadeIn>

      {showForm ? (
        <FadeIn>
          <form onSubmit={onCreate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <label className="label">Название карточки</label>
              <input
                className="input"
                required
                placeholder="Лекция 3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Тема</label>
              <input
                className="input"
                placeholder="Диалектика Гегеля"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <button className="btn-primary sm:!w-auto">Создать</button>
            </div>
          </form>
        </FadeIn>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="stagger space-y-2.5">
        {lectures.map((lecture) => (
          <Link
            key={lecture.id}
            href={`/app/lectures/${lecture.id}`}
            className="panel panel-interactive flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-medium tracking-tight">{lecture.title}</div>
              <div className="mt-0.5 truncate text-sm" style={{ color: "var(--fg-muted)" }}>
                {lecture.topic || "Тема не указана"}
                {lecture.lecture_date
                  ? ` · ${format(new Date(lecture.lecture_date), "d MMMM yyyy", { locale: ru })}`
                  : ""}
              </div>
            </div>
            <StatusBadge status={lecture.status} className="self-start sm:self-auto" />
          </Link>
        ))}
        {!lectures.length ? (
          <div className="panel p-6 text-sm" style={{ color: "var(--fg-muted)" }}>
            Лекций пока нет. Создайте карточку и загрузите аудио.
          </div>
        ) : null}
      </div>
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
