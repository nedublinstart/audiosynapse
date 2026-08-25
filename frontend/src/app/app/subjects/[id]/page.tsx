"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app" className="btn-ghost">
            <ArrowLeft size={16} /> Назад
          </Link>
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {subject?.name || "…"}
          </h2>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => void onDeleteSubject()}>
            <Trash2 size={16} />
          </button>
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} /> Лекция
          </button>
        </div>
      </div>

      {showForm ? (
        <form onSubmit={onCreate} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2">
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
          <div>
            <button className="btn-primary">Создать</button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        {lectures.map((lecture) => (
          <Link
            key={lecture.id}
            href={`/app/lectures/${lecture.id}`}
            className="panel flex flex-wrap items-center justify-between gap-3 p-4 transition hover:translate-y-[-1px]"
          >
            <div>
              <div className="font-medium">{lecture.title}</div>
              <div className="text-sm" style={{ color: "var(--fg-muted)" }}>
                {lecture.topic || "Тема не указана"}
                {lecture.lecture_date
                  ? ` · ${format(new Date(lecture.lecture_date), "d MMMM yyyy", { locale: ru })}`
                  : ""}
              </div>
            </div>
            <StatusBadge status={lecture.status} />
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
