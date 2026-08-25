"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileUp,
  GraduationCap,
  MessageSquare,
  Mic,
  Printer,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import {
  MarkdownNotes,
  exportNotesAsMarkdown,
  printNotesAsPdf,
} from "@/components/MarkdownNotes";
import { api, type ChatMessage, type Lecture } from "@/lib/api";

function LectureInner() {
  const params = useParams();
  const lectureId = Number(params.id);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [tab, setTab] = useState<"notes" | "chat">("notes");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [examMode, setExamMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLInputElement>(null);
  const materialRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const data = await api.getLecture(lectureId);
    setLecture(data);
    return data;
  }, [lectureId]);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (lecture?.status === "processing") {
      pollRef.current = setInterval(() => {
        void load();
      }, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [lecture?.status, load]);

  useEffect(() => {
    if (tab === "chat") {
      void api.listChat(lectureId).then(setChat).catch((e) => setError(e.message));
    }
  }, [tab, lectureId]);

  async function onAudio(file: File) {
    setBusy(true);
    setError("");
    try {
      const updated = await api.uploadAudio(lectureId, file);
      setLecture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  async function onMaterial(file: File) {
    setBusy(true);
    setError("");
    try {
      const updated = await api.uploadMaterial(lectureId, file);
      setLecture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const text = message.trim();
    setMessage("");
    setBusy(true);
    try {
      const optimistic: ChatMessage = {
        id: Date.now(),
        role: "user",
        content: text,
        exam_mode: examMode,
        created_at: new Date().toISOString(),
      };
      setChat((prev) => [...prev, optimistic]);
      const reply = await api.chat(lectureId, text, examMode);
      const history = await api.listChat(lectureId);
      setChat(history.length ? history : [...chat, optimistic, reply]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чата");
    } finally {
      setBusy(false);
    }
  }

  if (!lecture) {
    return (
      <AppShell>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {error || "Загрузка лекции…"}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${lecture.title}${lecture.topic ? ` — ${lecture.topic}` : ""}`}
      actions={
        <div className="flex items-center gap-1">
          {lecture.notes_markdown ? (
            <>
              <button
                className="btn-ghost"
                title="Экспорт Markdown / Notion"
                onClick={() =>
                  exportNotesAsMarkdown(
                    lecture.topic || lecture.title,
                    lecture.notes_markdown || ""
                  )
                }
              >
                <Download size={16} />
              </button>
              <button className="btn-ghost" title="Печать / PDF" onClick={printNotesAsPdf}>
                <Printer size={16} />
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app/subjects/${lecture.subject_id}`} className="btn-ghost">
            <ArrowLeft size={16} /> К предмету
          </Link>
          <StatusBadge status={lecture.status} />
          {lecture.audio_filename ? (
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              <Mic size={12} className="mr-1 inline" />
              {lecture.audio_filename}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={audioRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onAudio(f);
            }}
          />
          <input
            ref={materialRef}
            type="file"
            accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onMaterial(f);
            }}
          />
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => audioRef.current?.click()}
          >
            <Mic size={16} />
            {lecture.audio_filename ? "Заменить аудио" : "Загрузить аудио"}
          </button>
          <button
            className="btn-ghost panel !px-3"
            disabled={busy}
            onClick={() => materialRef.current?.click()}
          >
            <FileUp size={16} /> Материал
          </button>
        </div>
      </div>

      {lecture.enrichment_notice ? (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {lecture.enrichment_notice}
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        <button
          className="btn-ghost rounded-none border-b-2 px-3"
          style={{
            borderColor: tab === "notes" ? "var(--accent)" : "transparent",
            color: tab === "notes" ? "var(--fg)" : "var(--fg-muted)",
          }}
          onClick={() => setTab("notes")}
        >
          Конспект
        </button>
        <button
          className="btn-ghost rounded-none border-b-2 px-3"
          style={{
            borderColor: tab === "chat" ? "var(--accent)" : "transparent",
            color: tab === "chat" ? "var(--fg)" : "var(--fg-muted)",
          }}
          onClick={() => setTab("chat")}
        >
          <MessageSquare size={14} /> Чат по лекции
        </button>
      </div>

      {tab === "notes" ? (
        <article className="panel p-5 sm:p-8">
          {lecture.status === "processing" ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
              Synapse Core обрабатывает лекцию… Обычно это занимает около минуты в демо-режиме.
            </div>
          ) : lecture.notes_markdown ? (
            <MarkdownNotes content={lecture.notes_markdown} />
          ) : (
            <div className="py-16 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
              Загрузите аудио (.mp3, .wav, .m4a, .ogg), чтобы сгенерировать конспект по методу Корнелла.
            </div>
          )}
          {lecture.materials.length > 0 ? (
            <div className="mt-8 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
                Материалы
              </div>
              <ul className="space-y-1 text-sm">
                {lecture.materials.map((m) => (
                  <li key={m.id}>{m.filename}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ) : (
        <div className="panel flex h-[70vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm" style={{ color: "var(--fg-muted)" }}>
              Ответы строго по материалам этой лекции (RAG-контекст)
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={examMode}
                onChange={(e) => setExamMode(e.target.checked)}
              />
              <GraduationCap size={14} /> Режим «Экзамен»
            </label>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {chat.map((m) => (
              <div
                key={m.id}
                className="max-w-[85%] rounded-lg px-3 py-2 text-sm"
                style={{
                  marginLeft: m.role === "user" ? "auto" : 0,
                  background:
                    m.role === "user" ? "var(--accent-soft)" : "var(--bg-soft)",
                  color: "var(--fg)",
                }}
              >
                <MarkdownNotes content={m.content} />
              </div>
            ))}
            {!chat.length ? (
              <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                Спросите, например: «Объясни разницу между понятиями на примерах из этой лекции».
              </p>
            ) : null}
          </div>
          <form onSubmit={onChat} className="flex gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
            <input
              className="input"
              placeholder={examMode ? "Попроси вопросы или ответь на экзаменационный…" : "Вопрос по лекции…"}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="btn-primary" disabled={busy}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </AppShell>
  );
}

export default function LecturePage() {
  return (
    <RequireAuth>
      <LectureInner />
    </RequireAuth>
  );
}
